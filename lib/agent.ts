import { GoogleGenAI } from "@google/genai";
import { Guide, GuideSchema } from "./schema";
import { tavilyExtract, tavilySearch } from "./tavily";
import { MODEL } from "./config";
import { extractJson } from "./json-utils";
import { isOfficialUrl, registrableDomain } from "./domain";
import type { ResolvedApp } from "./resolve";

export { MODEL };

// Research budget: Gemini's own Google Search grounding tool turned out to
// have zero free quota on this project even though plain generation worked
// fine, so research runs through Tavily (search + extract) instead, and
// Gemini only sees the resulting plain text — no tools, no grounding.
const SEARCH_QUERIES = 3;
const INITIAL_EXTRACT_CAP = 5;
const FALLBACK_EXTRACT_CAP = 2;

// Per-page character budget sent to the model. Docs pages that bundle many
// topics (e.g. a single "brand verification" page that also covers
// restricted-scope verification near the bottom) can easily exceed a small
// limit — a prior 6000-char cutoff silently dropped exactly the
// restricted-scope/CASA section on Google's brand-verification page, past
// character 8783 on that page.
const PAGE_CHAR_LIMIT = 15000;

// If the initial research pass doesn't mention certain topics at all, a
// second, more targeted search runs before drafting — otherwise the agent
// tends to assume "doesn't apply" just because it didn't look hard enough.
// Two independent checks, since a provider can have review info but no
// scope-tier info (or vice versa) depending on which pages got extracted.
const REVIEW_KEYWORDS = /\breview\b|\bverif|\bmarketplace\b|\bpartner program\b/i;
const SCOPE_TIER_KEYWORDS =
  /\bsensitive scope|\brestricted scope|\bscope tier|\bsecurity assessment|\bCASA\b/i;

type FallbackCheck = { keywords: RegExp; query: string; label: string };
const FALLBACK_CHECKS: FallbackCheck[] = [
  {
    keywords: REVIEW_KEYWORDS,
    query: "app review verification marketplace review partner program",
    label: "review/verification",
  },
  {
    keywords: SCOPE_TIER_KEYWORDS,
    query: "sensitive restricted scope verification security assessment",
    label: "scope tiers",
  },
];

// Search results are often dominated by review sites, social posts, and
// third-party SDK wrappers rather than the provider's own docs. Rank
// candidates before picking which ones to spend an extract call on.
const JUNK_DOMAINS = [
  "trustpilot.com",
  "reddit.com",
  "quora.com",
  "youtube.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "linkedin.com",
  "g2.com",
  "capterra.com",
  "producthunt.com",
  "glassdoor.com",
  "wikipedia.org",
  "medium.com",
];
const DOC_HINTS = ["docs", "developer", "developers", "api"];

// A provider can have multiple products that technically say "OAuth" —
// e.g. Apple Ads (client_credentials, server-to-server access to your own
// ad account) vs. Sign in with Apple (authorization_code, end-user
// consent). A generic "<app> OAuth" search tends to match whichever page
// uses the word "OAuth" more prominently, not whichever is actually the
// end-user-facing product. These keyword sets catch that mismatch after
// extraction so a second, more targeted search can run.
const USER_DELEGATED_KEYWORDS =
  /\bauthorization code\b|\bsign[- ]?in with\b|\bconsent screen\b|\bredirect the user\b|\buser authoriz|\buser consent\b/i;
const CLIENT_CREDENTIALS_KEYWORDS =
  /\bclient[_ ]credentials\b|\bserver[- ]to[- ]server\b|\byour own (ad )?account\b|\bapp-level token\b|\bapp-only\b/i;

// Several providers (Reddit, Facebook, LinkedIn, X, Pinterest) run a
// separate Ads/Marketing API alongside their main consumer API, on its
// own subdomain. That Ads API is almost never what an agent builder means
// by "<app> OAuth" — but its docs tend to be more keyword-dense for
// "OAuth"/"authorization" than the main API's, so they otherwise outrank
// it in search. Deprioritize unless the resolved app itself is the ads
// product (appSlug already contains "ads", e.g. "Reddit Ads").
const ADS_SUBDOMAIN = /(^|\.)ads[.-]/i;

// Exported for testing — see the "reddit.com itself outranked by blogs"
// regression test in lib/agent.test.ts.
export function scoreResult(
  result: { url: string; score?: number },
  appSlug: string,
  officialDomains: string[],
  // URLs that came from a search specifically restricted to the official
  // domain (Tavily's include_domains), as opposed to merely happening to
  // be on that domain within an unrestricted web search. This distinction
  // matters because an unrestricted "<app> review verification" search
  // against a provider like Reddit also turns up unrelated reddit.com
  // threads about OTHER apps' reviews — those shouldn't get full official
  // -domain priority just for sharing a hostname with the real docs.
  domainSearchUrls: Set<string> = new Set()
): number {
  let score = result.score ?? 0;
  let host: string;
  try {
    host = new URL(result.url).hostname.toLowerCase();
  } catch {
    return -100;
  }

  // A page actually on the resolved official/developer-portal domain is
  // the best possible source, full stop — check this before anything
  // else. This matters because JUNK_DOMAINS below is itself a list of
  // real companies' domains (reddit.com, x.com, linkedin.com,
  // facebook.com): generically correct, since e.g. a Reddit discussion
  // thread about some OTHER app is junk, but wrong when the app BEING
  // researched is Reddit itself — it penalized Reddit's own docs pages
  // while giving unrelated blogs (octolens.com, painonsocial.com) no
  // penalty at all, so blogs about Reddit's API outranked Reddit's own
  // pages. isOfficialUrl is the same registrable-domain check used to
  // validate the final website/developerPortalUrl links.
  const isAdsSubdomain = ADS_SUBDOMAIN.test(host) && !appSlug.includes("ads");
  const isOfficial = officialDomains.some((d) => isOfficialUrl(result.url, d));

  if (isOfficial && domainSearchUrls.has(result.url)) {
    return score + 20 - (isAdsSubdomain ? 8 : 0);
  }
  if (isOfficial) {
    // On-domain but only found incidentally by an unrestricted search —
    // still never treat as junk, but don't let it auto-outrank real docs
    // that an unrestricted search also happened to find.
    return score + 3 - (isAdsSubdomain ? 8 : 0);
  }

  if (JUNK_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) score -= 10;
  if (DOC_HINTS.some((h) => host.includes(h))) score += 3;
  if (appSlug && host.includes(appSlug)) score += 2;
  if (isAdsSubdomain) score -= 5;
  return score;
}

const EVIDENCE_LEVEL_ENUM = ["hand_checked", "doc_sourced", "inferred", "uncertain"];

// sourceUrl/note are deliberately NOT in "required" here even though
// lib/schema.ts's EvidenceSchema treats them as always-present-but-
// nullable — Gemini's JSON schema dialect doesn't reliably support
// nullable types (no precedent for it elsewhere in this file), so the
// model is allowed to omit them, and fillEvidenceDefaults() below
// normalizes any missing/empty value to null before Zod validation. This
// mirrors the same omit-then-default pattern lib/resolve.ts already uses
// for developer_portal_url.
const EVIDENCE_SCHEMA = {
  type: "object",
  properties: {
    level: { type: "string", enum: EVIDENCE_LEVEL_ENUM },
    sourceUrl: { type: "string" },
    note: { type: "string" },
  },
  required: ["level"],
};

const VALUE_WITH_EVIDENCE_SCHEMA = {
  type: "object",
  properties: {
    value: { type: "string" },
    evidence: EVIDENCE_SCHEMA,
  },
  required: ["value", "evidence"],
};

const SCOPE_ITEM_SCHEMA = {
  type: "object",
  properties: {
    scope: { type: "string" },
    why: { type: "string" },
  },
  required: ["scope", "why"],
};

const STEP_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    owner: { type: "string", enum: ["human", "agent", "both"] },
    agentAssist: { type: "string" },
    evidence: EVIDENCE_SCHEMA,
  },
  required: ["title", "description", "owner", "evidence"],
};

const BLOCKER_SCHEMA = {
  type: "object",
  properties: {
    problem: { type: "string" },
    fix: { type: "string" },
    evidence: EVIDENCE_SCHEMA,
  },
  required: ["problem", "fix", "evidence"],
};

// JSON Schema enforced on the drafting call via response_format. Mirrors
// lib/schema.ts's GuideSchema — kept hand-written since the Gemini schema
// dialect only supports a subset of JSON Schema (no minLength, no
// nullable, etc). This is the contract with the rest of the app: the UI
// and the compare script both read against lib/schema.ts, so this must
// never drift from it.
// Exported so lib/verifier.ts can embed it in its own response schema
// (the verifier returns a full corrected Guide, not just a diff) without
// duplicating this and risking drift between the two.
export const GUIDE_JSON_SCHEMA = {
  type: "object",
  properties: {
    slug: { type: "string" },
    appName: { type: "string" },
    website: { type: "string" },
    developerPortalUrl: { type: "string" },
    surface: { type: "string" },
    otherSurfaces: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          whyNot: { type: "string" },
        },
        required: ["name", "whyNot"],
      },
    },
    oauthFit: {
      type: "object",
      properties: {
        value: {
          type: "string",
          enum: ["standard_oauth", "oauth_with_caveats", "sign_in_only", "no_oauth"],
        },
        reason: { type: "string" },
      },
      required: ["value", "reason"],
    },
    decision: {
      type: "object",
      properties: {
        question: { type: "string" },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              pickWhen: { type: "array", items: { type: "string" } },
              tradeoff: { type: "string" },
            },
            required: ["name", "pickWhen", "tradeoff"],
          },
        },
        recommendation: { type: "string" },
      },
      required: ["question", "options", "recommendation"],
    },
    difficulty: { type: "string", enum: ["easy", "medium", "hard", "gated"] },
    summary: { type: "string" },
    setupTime: VALUE_WITH_EVIDENCE_SCHEMA,
    approval: {
      type: "object",
      properties: {
        paths: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              reviewRequired: { type: "boolean" },
              wait: { type: "string" },
              notes: { type: "string" },
              evidence: EVIDENCE_SCHEMA,
            },
            required: ["name", "reviewRequired", "wait", "notes", "evidence"],
          },
        },
      },
      required: ["paths"],
    },
    cost: {
      type: "object",
      properties: {
        value: { type: "string" },
        notes: { type: "string" },
        evidence: EVIDENCE_SCHEMA,
      },
      required: ["value", "notes", "evidence"],
    },
    rateLimits: VALUE_WITH_EVIDENCE_SCHEMA,
    prerequisites: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, evidence: EVIDENCE_SCHEMA },
        required: ["text", "evidence"],
      },
    },
    scopes: {
      type: "object",
      properties: {
        minimum: { type: "array", items: SCOPE_ITEM_SCHEMA },
        optional: { type: "array", items: SCOPE_ITEM_SCHEMA },
        modes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              whenToUse: { type: "string" },
            },
            required: ["name", "whenToUse"],
          },
        },
        evidence: EVIDENCE_SCHEMA,
      },
      required: ["minimum", "optional", "modes", "evidence"],
    },
    steps: { type: "array", items: STEP_SCHEMA },
    blockers: { type: "array", items: BLOCKER_SCHEMA },
    agentCanDo: { type: "array", items: { type: "string" } },
    humanMustDo: { type: "array", items: { type: "string" } },
    composioHandoff: { type: "string" },
    openQuestions: { type: "array", items: { type: "string" } },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, url: { type: "string" } },
        required: ["title", "url"],
      },
    },
    generatedBy: { type: "string", enum: ["agent"] },
    lastVerified: { type: "string" },
  },
  required: [
    "slug",
    "appName",
    "website",
    "developerPortalUrl",
    "surface",
    "otherSurfaces",
    "oauthFit",
    "difficulty",
    "summary",
    "setupTime",
    "approval",
    "cost",
    "rateLimits",
    "prerequisites",
    "scopes",
    "steps",
    "blockers",
    "agentCanDo",
    "humanMustDo",
    "composioHandoff",
    "openQuestions",
    "sources",
    "generatedBy",
    "lastVerified",
  ],
};

// Normalizes every evidence-shaped object's sourceUrl/note from
// "omitted/empty" (what the model may legitimately produce — see
// EVIDENCE_SCHEMA's comment above) to the explicit null the schema
// requires, before Zod validation. Deliberately structural (keys on any
// object matching this shape) rather than a fixed list of paths, so it
// doesn't need updating every time a new evidence-bearing field is added.
export function fillEvidenceDefaults(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(fillEvidenceDefaults);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("level" in obj) {
      if (!obj.sourceUrl) obj.sourceUrl = null;
      if (!obj.note) obj.note = null;
    }
    for (const key of Object.keys(obj)) {
      obj[key] = fillEvidenceDefaults(obj[key]);
    }
    if ("agentAssist" in obj && !obj.agentAssist) obj.agentAssist = null;
  }
  return value;
}

// Baseline capabilities every OAuth app registration needs regardless of
// provider — enforced in code (see ensureAgentCanDo below), not just
// prompted, because an empty agentCanDo array was observed in practice.
// Scoped to the SETUP process (finding the console, filling the
// registration form, drafting the review submission), not to writing
// OAuth code: this guide is for a developer using Composio, which manages
// the actual token exchange/storage/refresh — an agent implementing that
// itself would be redundant work the guide shouldn't be asking for.
const BASELINE_AGENT_CAN_DO = [
  "Find the developer console / app registration page and its current required fields",
  "Pre-fill the app registration form — name, description, redirect URI, minimum required scopes",
  "Check prerequisites before submission — privacy policy URL, homepage, verified domain, logo specs",
  "Draft the review/verification submission — scope justifications, use-case text, demo instructions",
];

const DRAFT_SYSTEM = `You are an OAuth setup researcher for developers building AI agents on Composio.

Given extracted developer-docs pages for a provider (e.g. Google, Slack, GitHub), produce a guide that tells a developer how to create and configure that provider's OAuth app — so THEIR end users can connect accounts — and get it approved for use.

CONTEXT
- Composio handles the OAuth runtime: building auth URLs, callbacks, token exchange, refresh, and storing tokens. Do NOT include any of that as a setup step or an agentCanDo/humanMustDo item, anywhere.
- The developer's job is: get a provider account, register the OAuth app, configure redirect URIs and scopes, pass any review/verification, then hand the client ID + secret to Composio (the "composioHandoff" field is literally this last step, stated concretely).
- Composio's actual redirect/callback URL to register in the provider's OAuth app is https://backend.composio.dev/api/v3/toolkits/auth/callback (verified against Composio's own docs — use this exact URL in "composioHandoff" and anywhere else the redirect URI value matters, don't invent a different one or describe it vaguely as "Composio's callback URL"). The dashboard flow is: select the OAuth2 scheme for this provider, enable "Use your own developer credentials", then enter the client ID, client secret, and that same redirect URI to create the auth config.
- Never include "the user authorizes/consents via the consent screen" as a step. That's the END USER connecting their account later, not the developer's one-time setup.

STEP 1: PICK THE RIGHT SURFACE
Many providers have several APIs (e.g. Apple, Google, Microsoft) that all technically involve "OAuth." Choose the "surface" — the specific product/API — where END USERS grant access to THEIR OWN accounts via a real OAuth consent flow (authorization_code with a redirect and a consent step), not a server-to-server/client_credentials product that only grants the developer access to their own account/ad account with no end user involved. State which surface this guide covers in the "surface" field (e.g. "Sign in with Apple", not just "Apple"), and list every other OAuth-adjacent surface you saw mentioned in the sources in "otherSurfaces" with a one-line reason it wasn't chosen — even if you're confident, so the reader knows what else exists.

STEP 2: CLASSIFY OAUTH FIT (required, in "oauthFit")
- "standard_oauth": normal authorization_code flow with user consent, no unusual gate.
- "oauth_with_caveats": a normal user-consent flow exists, but with notable restrictions — partner-program gating, limited self-serve scopes, mandatory review even for basic use, etc.
- "sign_in_only": OAuth/OIDC exists but only for identity (sign-in) — no delegated access to the user's data.
- "no_oauth": no user-delegated OAuth exists at all; explain in "reason" what auth the provider actually offers instead (API keys, service accounts, JWTs).
Give one concrete sentence in "reason". If "no_oauth" or "sign_in_only", still return the full JSON with every field filled as best you can, but keep "steps" short and make "summary" state plainly what a developer can and can't do here.

RESEARCH, for the chosen surface:
- How to create the OAuth app / register a client, and whether the provider offers more than one distinct app type or setup path (e.g. GitHub OAuth App vs. GitHub App, Google Internal vs. External). If so, populate the "decision" field describing that choice — this is the single highest-value thing a guide can get right and the most commonly missed; scan every source for comparison language ("differences between X and Y", "X vs Y") before concluding there's only one path.
- Whether any setting is permanent or irreversible once chosen at creation time. Call this out as a blocker if the docs mention one.
- Redirect URI rules. The redirect URI the developer registers is https://backend.composio.dev/api/v3/toolkits/auth/callback (Composio's own callback URL, not anything the developer builds) — state the rules (format, HTTPS requirement, exact-match vs. wildcard) as something to register correctly, and name that exact URL rather than describing it vaguely.
- Scopes: separate "minimum for a typical agent integration" ("scopes.minimum") from "optional/advanced" ("scopes.optional"). If the provider has special modes (e.g. acting as the user vs. acting as the app/bot), explain each in "scopes.modes" with when to pick which, one line each.
- Whether the provider classifies scopes into tiers (basic / sensitive / restricted or equivalent). For each tier beyond the most basic, state what it requires (additional verification, a security assessment, cost, turnaround time, whether it's renewed periodically) in "scopes.evidence"/"approval.paths" as appropriate — never fold this into one vague "review is needed" line.
- Approval: give a concrete range PER PATH in "approval.paths" (e.g. one path for internal/private use, one for a public listing, one for a verified/restricted tier) — each with its own wait and whether review is required. Never write "varies" with nothing else.
- Rate limits ("rateLimits"), and any partner-program or paid-tier gate.
- Prerequisites ("prerequisites"): things to have ready before registration — privacy policy URL, homepage, verified domain, logo specs, business entity, etc.
- Any setting specifically relevant to AI agents or autonomous/bot clients (e.g. a checkbox or client type like Google's "Use this client for an AI-powered agent"). Call it out explicitly as its own step or blocker if the docs mention one, even if its effect is unclear.
- Pricing/cost ("cost"): fill from the pricing/changes sources you were given, not from what you already believe about this provider — a provider that was free last year may not be free now. State the actual pricing model and rough rates in plain terms in "value", and note free-tier limits or exceptions in "notes" (or state plainly that exact current pricing couldn't be confirmed and add an openQuestions entry — never state a specific rate you don't have a source for).

WRITING RULES
- Each field appears once. Don't repeat cost, time, or approval info in multiple places (e.g. don't restate pricing inside a step's description).
- Step titles are short and plain — no prefixes like "Start building:" or "Go live:". The approval-path structure already carries that distinction.
- Navigation paths must be exact (e.g. "Settings → API → OAuth applications"). If you aren't sure of the exact current path, give your best guess and mark that step's evidence "inferred" — never write "X or Y page".
- Official docs describe UI navigation that can go stale between when the doc was written and now — reflect that honestly via the evidence level, don't overstate confidence.
- Blockers are real, specific problems a developer hits (no admin rights, redirect URI mismatch, one-time secret download, domain verification, a required business ID, sensitive-scope review) — each with a concrete fix, not generic advice.
- "openQuestions" is only for things that would change a developer's decision or timeline, and that are genuinely unverifiable from what's available — not a dumping ground, and not trivia. Check whether your sources already answer something before adding it here.

EVIDENCE — every claim-bearing field carries an "evidence" object:
- "level": you were never hands-on with this provider's UI, so NEVER use "hand_checked" — only "doc_sourced" (a source in "Available sources" states it directly — "sourceUrl" required, must be from that list, never invented), "inferred" (a reasonable conclusion not directly stated — explain why in "note"), or "uncertain" (conflicting or missing info — say what you checked in "note").
- Prefer official sources (the provider's own developer docs, pricing pages, changelogs) over tutorials, SDK wrapper docs, and blogs. If a claim is only supported by a third-party source because no official page covers that point, say so in "note" — this applies especially to pricing and rate figures, where tutorials and blog posts are often stale.
- Never write "none", "free", or "no review" for a limit/cost/approval field unless an official source actually says so — otherwise mark it "uncertain" and say what you checked.
- Populate the top-level "sources" array with every (title, url) pair you actually cited in any evidence.sourceUrl, deduplicated.

AGENT VS HUMAN SPLIT — "agentCanDo" must be tasks that move the SETUP or APPROVAL forward:
- Finding the exact developer console URL and current form fields.
- Pre-filling registration values: app name, description, redirect URI, minimum scopes.
- Drafting review/verification submissions: scope justifications, use-case text, demo video script.
- Checking prerequisites: privacy policy URL, homepage, logo specs, domain verification.
- Driving the browser through registration until a login, payment, or identity wall.
- Drafting an email to the provider's API/partner team when requirements are unclear.
Never list token handling, callback code, or API calls here. "agentCanDo" must never be empty.

"humanMustDo" must be things only a person can do:
- Own or create the account/workspace with admin rights.
- Accept developer terms, verify identity or domain, pay fees.
- Submit for review and respond to reviewers.
- Securely store the client secret and hand it to Composio.
Never list "authorize via consent screen" — that's the end user, not the developer.

STEPS: tag each with "owner" — "human" (requires login, payment, or legal action only a person can take), "agent" (an agent can fully drive this — finding pages, filling forms, drafting text), or "both" (a human must get past a wall — login, payment, identity verification — but an agent can do the rest, e.g. pre-filling the form once logged in). On a "human"/"both" step, use "agentAssist" for a one-line note on exactly what the agent can do there; set it to null on a pure "human" step with nothing agent-assistable (e.g. "accept developer terms"). Whenever API usage is paid, or a "freemium" tier requires a payment method just to use the API, billing/payment is always a "human"-owned step — an agent cannot enter payment details or accept legal terms for someone.

OTHER RULES
- "difficulty" is one of easy/medium/hard/gated — weigh the hardest approval path's requirements, not just the easiest one; a provider can look easy until production access turns out to need verification, a paid security assessment, or a partner program.
- Only include "decision" if the sources describe more than one distinct setup path — omit it entirely otherwise.
- "composioHandoff" states: register https://backend.composio.dev/api/v3/toolkits/auth/callback as the redirect URI, then in Composio's dashboard select this provider's OAuth2 scheme, enable "Use your own developer credentials", and enter the client ID, client secret, and that same redirect URI to create the auth config.
- "generatedBy" must be exactly "agent". "lastVerified" must be today's date in ISO format (YYYY-MM-DD). "slug" must be lowercase-kebab-case derived from the app name.`;

export type ProgressService = "tavily" | "gemini" | "verifier";
export type ProgressFn = (message: string, service?: ProgressService) => void;

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "guide"
  );
}

function ensureAgentCanDo(guide: Guide): Guide {
  if (guide.agentCanDo.length > 0) return guide;
  return { ...guide, agentCanDo: BASELINE_AGENT_CAN_DO };
}

// A drafted website/developerPortalUrl came from whatever page the model
// extracted it from — not necessarily the resolved, trusted identity. A
// typo'd input like "reddddit" previously could lead the research step to
// extract a third-party scraper site (redditcommentscraper.com), and the
// drafted guide would present that as the app's own website. Enforce
// against the resolved official domain before the guide is ever returned:
// keep the drafted URL only if it's actually on that domain (or the
// resolved developer portal's domain); otherwise fall back to
// https://{officialDomain}; if even that can't be confirmed, mark the
// field unverified rather than silently keeping an unconfirmed URL.
export function enforceOfficialLinks(guide: Guide, resolved: ResolvedApp): Guide {
  const officialDomainValid = Boolean(registrableDomain(resolved.official_domain));
  const portalDomain = resolved.developer_portal_url
    ? registrableDomain(resolved.developer_portal_url)
    : null;

  const isTrusted = (url: string) =>
    isOfficialUrl(url, resolved.official_domain) ||
    (portalDomain !== null && registrableDomain(url) === portalDomain);

  let website = guide.website;
  let websiteVerified = true;
  if (!isTrusted(website)) {
    if (officialDomainValid) {
      website = `https://${resolved.official_domain}`;
    } else {
      websiteVerified = false;
    }
  }

  let developerPortalUrl = guide.developerPortalUrl;
  let developerPortalVerified = true;
  if (!isTrusted(developerPortalUrl)) {
    if (resolved.developer_portal_url) {
      developerPortalUrl = resolved.developer_portal_url;
    } else if (officialDomainValid) {
      developerPortalUrl = `https://${resolved.official_domain}`;
    } else {
      developerPortalVerified = false;
    }
  }

  return { ...guide, website, developerPortalUrl, websiteVerified, developerPortalVerified };
}

type ResearchResult = { notes: string; sourceUrls: string[] };

async function research(
  appInput: string,
  onProgress: ProgressFn,
  tavilyCounter: { count: number },
  officialDomains: string[] = [],
  // Host-matching key for result scoring — the company ("google"), even
  // when appInput is a company + product search subject ("Google Gmail").
  appSlug: string = slugify(appInput)
): Promise<ResearchResult> {
  // "sign in" + "user login" + "authorization code" bias the search toward
  // the end-user-facing product rather than whichever API page happens to
  // say "OAuth" most prominently (e.g. an ads/server-to-server API).
  // A dated pricing/changes query catches cases like X's Feb 2026 move to
  // pay-per-use: a bare "<app> API pricing" search tends to surface
  // outdated tutorials and aggregator blogs from before a pricing change,
  // not the current terms. The year is computed at request time, not
  // hardcoded, so this doesn't go stale.
  const currentYear = new Date().getFullYear();
  const queries = [
    `${appInput} sign in OAuth user login authorization code developer documentation`,
    `${appInput} app review verification`,
    `${appInput} API pricing ${currentYear} changes`,
  ].slice(0, SEARCH_QUERIES);

  onProgress(`Searching for "${appInput}" OAuth setup docs…`, "tavily");
  onProgress(`Searching for "${appInput}" review and verification policy…`, "tavily");
  onProgress(`Searching for "${appInput}" API pricing and recent changes…`, "tavily");

  tavilyCounter.count += queries.length;
  const searchPromises = queries.map((q) => tavilySearch(q, 5));

  // The generic queries above search the whole web, so for a provider whose
  // own domain is full of non-docs content (Reddit, X, LinkedIn, Facebook —
  // the same companies that are in JUNK_DOMAINS for everyone else's guide)
  // they can surface unrelated pages on that domain (a random subreddit
  // thread) instead of the provider's real docs, just because something on
  // reddit.com ranked for an unrelated keyword match. A search restricted to
  // the resolved official domain(s) via Tavily's include_domains goes
  // straight to the real docs instead of hoping a generic search finds them.
  const bareOfficialDomains = officialDomains
    .map((d) => registrableDomain(d))
    .filter((d): d is string => Boolean(d));
  const hasDomainSearch = bareOfficialDomains.length > 0;
  if (hasDomainSearch) {
    onProgress(`Searching ${bareOfficialDomains.join(", ")} directly for OAuth docs…`, "tavily");
    tavilyCounter.count += 1;
    searchPromises.push(
      // Reusing the primary query's "sign in"/"user login" phrasing here
      // still ranked a separate Ads API's quickstart guide above the
      // provider's actual API reference docs — ads-api.* subdomains are
      // just more keyword-dense for "OAuth"/"authorization" than a
      // provider's main docs. "documentation reference ... create app"
      // biases toward reference-doc phrasing instead of tutorial-ish
      // phrasing, which empirically (tested against Reddit) ranks the
      // real docs page (reddit.com/dev/api/oauth) above the Ads API.
      tavilySearch(
        `${appInput} API documentation reference OAuth authorization scopes create app`,
        5,
        bareOfficialDomains
      )
    );
  }

  const searchResults = await Promise.all(searchPromises);
  // The domain-restricted search (if any) is always the last promise
  // pushed above — record its URLs so scoreResult can tell "found by the
  // targeted domain search" apart from "merely happens to share a
  // hostname with something an unrestricted search turned up."
  const domainSearchUrls = new Set(
    hasDomainSearch ? searchResults[searchResults.length - 1].map((r) => r.url) : []
  );

  const seen = new Set<string>();
  const candidates = searchResults
    .flat()
    .filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    })
    .sort(
      (a, b) =>
        scoreResult(b, appSlug, officialDomains, domainSearchUrls) -
        scoreResult(a, appSlug, officialDomains, domainSearchUrls)
    );

  const selected = candidates.slice(0, INITIAL_EXTRACT_CAP);
  if (selected.length === 0) {
    return { notes: "No search results found.", sourceUrls: [] };
  }

  for (const r of selected) {
    onProgress(`Found: ${r.title} (${r.url})`, "tavily");
  }

  onProgress(`Reading ${selected.length} page(s)…`, "tavily");
  tavilyCounter.count += selected.length;
  const extracted = await tavilyExtract(selected.map((r) => r.url));

  // Second pass(es): if nothing extracted so far mentions a topic the
  // provider might have (review/verification, or scope tiers like
  // sensitive/restricted), search for it specifically rather than silently
  // drafting a guide that assumes it doesn't apply — this was the single
  // biggest gap against the hand-tested Google guide (missed the CASA
  // security assessment entirely because the first two queries never
  // surfaced a page that mentioned it).
  for (const check of FALLBACK_CHECKS) {
    // Test against what the model will actually see (truncated per page),
    // not the full raw_content — a keyword present only past the
    // per-page cutoff is, for the model's purposes, not present at all.
    const combinedSoFar = extracted
      .map((r) => r.raw_content.slice(0, PAGE_CHAR_LIMIT))
      .join("\n");
    if (check.keywords.test(combinedSoFar)) continue;

    onProgress(`No ${check.label} info found yet — searching specifically for it…`, "tavily");
    tavilyCounter.count += 1;
    const fallbackResults = await tavilySearch(`${appInput} ${check.query}`, 5);
    const fallbackCandidates = fallbackResults
      .filter((r) => !seen.has(r.url))
      .sort((a, b) => scoreResult(b, appSlug, officialDomains, domainSearchUrls) - scoreResult(a, appSlug, officialDomains, domainSearchUrls))
      .slice(0, FALLBACK_EXTRACT_CAP);

    if (fallbackCandidates.length > 0) {
      fallbackCandidates.forEach((r) => seen.add(r.url));
      for (const r of fallbackCandidates) {
        onProgress(`Found: ${r.title} (${r.url})`, "tavily");
      }
      tavilyCounter.count += fallbackCandidates.length;
      const moreExtracted = await tavilyExtract(fallbackCandidates.map((r) => r.url));
      extracted.push(...moreExtracted);
    }
  }

  // Resolve step: if everything extracted so far reads like client_credentials
  // / server-to-server docs (e.g. an Ads API) with no sign of an end-user
  // consent flow, this is very likely the wrong product for an agent builder
  // whose users need to connect their own accounts. Search specifically for
  // the "sign in with X" / user-authentication product before giving up —
  // better to spend one more search than draft a guide for the wrong API.
  const finalText = extracted.map((r) => r.raw_content.slice(0, PAGE_CHAR_LIMIT)).join("\n");
  if (
    CLIENT_CREDENTIALS_KEYWORDS.test(finalText) &&
    !USER_DELEGATED_KEYWORDS.test(finalText)
  ) {
    onProgress(
      `Found docs look like server-to-server access, not end-user sign-in — searching for the user-facing OAuth product…`,
      "tavily"
    );
    tavilyCounter.count += 1;
    const signInResults = await tavilySearch(
      `"Sign in with ${appInput}" OR ${appInput} OAuth user authentication consent`,
      5
    );
    const signInCandidates = signInResults
      .filter((r) => !seen.has(r.url))
      .sort((a, b) => scoreResult(b, appSlug, officialDomains, domainSearchUrls) - scoreResult(a, appSlug, officialDomains, domainSearchUrls))
      .slice(0, FALLBACK_EXTRACT_CAP);

    if (signInCandidates.length > 0) {
      signInCandidates.forEach((r) => seen.add(r.url));
      for (const r of signInCandidates) {
        onProgress(`Found: ${r.title} (${r.url})`, "tavily");
      }
      tavilyCounter.count += signInCandidates.length;
      const moreExtracted = await tavilyExtract(signInCandidates.map((r) => r.url));
      extracted.push(...moreExtracted);
    }
  }

  const notes = extracted
    .map((r) => `Source: ${r.url}\n${r.raw_content.slice(0, PAGE_CHAR_LIMIT)}`)
    .join("\n\n---\n\n");

  return {
    notes: notes || "Extraction failed for all pages.",
    sourceUrls: extracted.map((r) => r.url),
  };
}

async function draft(
  ai: GoogleGenAI,
  appInput: string,
  researchNotes: string,
  sourceUrls: string[],
  onProgress: ProgressFn,
  callCounter: { count: number },
  retryNote?: string
): Promise<string> {
  onProgress(
    retryNote
      ? "Output didn't match the required format — asking the model to fix it…"
      : "Drafting the guide from extracted pages…",
    "gemini"
  );

  const sourcesList = sourceUrls.length
    ? sourceUrls.map((u) => `- ${u}`).join("\n")
    : "(none — extraction found no usable pages)";

  const base = `App: "${appInput}"\n\nAvailable sources (only cite these):\n${sourcesList}\n\nExtracted page content:\n${researchNotes}`;
  const input = retryNote ? `${base}\n\n${retryNote}` : `${base}\n\nProduce the guide now.`;

  callCounter.count++;
  const interaction = await ai.interactions.create({
    model: MODEL,
    input,
    system_instruction: DRAFT_SYSTEM,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: GUIDE_JSON_SCHEMA,
    },
  });

  return interaction.output_text ?? "";
}

// Takes an already-resolved identity (see lib/resolve.ts), not a raw user
// string — every search query, the draft call, the slug, and the final
// website/developerPortalUrl check all key off resolved.canonical_name /
// resolved.official_domain, never whatever the user originally typed.
export async function generateGuide(
  resolved: ResolvedApp,
  onProgress: ProgressFn
): Promise<Guide> {
  const appInput = resolved.canonical_name;
  // Research and drafting target the specific product when one was named
  // ("Google Gmail"), but the slug below stays keyed to the company.
  const subject = resolved.product ? `${appInput} ${resolved.product}` : appInput;
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const geminiCounter = { count: 0 };
  const tavilyCounter = { count: 0 };

  try {
    const officialDomains = [resolved.official_domain, resolved.developer_portal_url].filter(
      (d): d is string => Boolean(d)
    );
    const { notes, sourceUrls } = await research(
      subject,
      onProgress,
      tavilyCounter,
      officialDomains,
      slugify(appInput)
    );

    let lastError = "";
    const tryParse = (raw: string): Guide | null => {
      try {
        const parsed = fillEvidenceDefaults(JSON.parse(extractJson(raw))) as Record<
          string,
          unknown
        >;
        parsed.generatedBy = "agent";
        parsed.lastVerified = new Date().toISOString().slice(0, 10);
        // Always derive the slug from the resolved canonical name, not
        // whatever the model drafted — this is what keeps a typo'd input
        // from minting a separate guide/URL from the real one.
        parsed.slug = slugify(appInput);
        const result = GuideSchema.safeParse(parsed);
        if (result.success)
          return enforceOfficialLinks(ensureAgentCanDo(result.data), resolved);
        lastError = result.error.message;
        return null;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        return null;
      }
    };

    const first = await draft(ai, subject, notes, sourceUrls, onProgress, geminiCounter);
    const firstGuide = tryParse(first);
    if (firstGuide) return firstGuide;

    const second = await draft(
      ai,
      subject,
      notes,
      sourceUrls,
      onProgress,
      geminiCounter,
      `Your previous output did not match the required schema. Error: ${lastError}\n\nProduce the corrected guide now.`
    );
    const secondGuide = tryParse(second);
    if (secondGuide) return secondGuide;

    throw new Error(`Agent failed to produce a valid guide: ${lastError}`);
  } finally {
    console.log(
      `[agent] "${appInput}": ${tavilyCounter.count} Tavily call(s), ${geminiCounter.count} Gemini call(s) (model=${MODEL})`
    );
  }
}
