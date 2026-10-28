import { describe, expect, it } from "vitest";
import { enforceOfficialLinks, fillEvidenceDefaults, scoreResult } from "./agent";
import type { Guide } from "./schema";
import type { ResolvedApp } from "./resolve";

const docSourced = (url: string) => ({
  level: "doc_sourced" as const,
  sourceUrl: url,
  note: null,
});

function baseGuide(overrides: Partial<Guide> = {}): Guide {
  return {
    slug: "reddit",
    appName: "Reddit",
    website: "https://reddit.com",
    developerPortalUrl: "https://www.reddit.com/dev/api",
    surface: "Reddit Data API",
    otherSurfaces: [],
    oauthFit: { value: "standard_oauth", reason: "Standard authorization_code flow." },
    difficulty: "easy",
    summary: "Set up a Reddit OAuth app.",
    setupTime: { value: "15 min", evidence: docSourced("https://reddit.com/dev/api") },
    approval: {
      paths: [
        {
          name: "Personal use",
          reviewRequired: false,
          wait: "None",
          notes: "",
          evidence: docSourced("https://reddit.com/dev/api"),
        },
      ],
    },
    cost: {
      value: "Free for standard use",
      notes: "Generous free tier for personal use.",
      evidence: docSourced("https://reddit.com/dev/api"),
    },
    rateLimits: { value: "60 requests/minute", evidence: docSourced("https://reddit.com/dev/api") },
    prerequisites: [],
    scopes: {
      minimum: [],
      optional: [],
      modes: [],
      evidence: docSourced("https://reddit.com/dev/api"),
    },
    steps: [
      {
        title: "Create an app",
        description: "Register an app in Reddit's developer settings.",
        owner: "human",
        agentAssist: null,
        evidence: docSourced("https://reddit.com/prefs/apps"),
      },
    ],
    blockers: [],
    agentCanDo: ["Pre-fill the registration form"],
    humanMustDo: ["Create the Reddit account"],
    composioHandoff: "Paste the client ID and secret into Composio.",
    openQuestions: [],
    sources: [{ title: "Reddit API docs", url: "https://reddit.com/dev/api" }],
    generatedBy: "agent",
    lastVerified: "2026-10-28",
    ...overrides,
  };
}

const resolvedReddit: ResolvedApp = {
  canonical_name: "Reddit",
  official_domain: "reddit.com",
  developer_portal_url: null,
  confidence: "high",
  corrected_from: "reddddit",
};

describe("enforceOfficialLinks", () => {
  it("rejects a third-party scraper site and falls back to the official domain", () => {
    // The exact bug: drafting picked up a site whose domain merely
    // contains the brand name, not the company's own domain.
    const drafted = baseGuide({
      website: "https://redditcommentscraper.com/article-reddit-pricing.html",
    });

    const result = enforceOfficialLinks(drafted, resolvedReddit);

    expect(result.website).toBe("https://reddit.com");
    expect(result.websiteVerified).toBe(true);
  });

  it("keeps a website that is already on the official domain", () => {
    const drafted = baseGuide({ website: "https://www.reddit.com/some/path" });

    const result = enforceOfficialLinks(drafted, resolvedReddit);

    expect(result.website).toBe("https://www.reddit.com/some/path");
    expect(result.websiteVerified).toBe(true);
  });

  it("keeps a developer portal URL on the resolved developer portal's domain", () => {
    const resolved: ResolvedApp = {
      ...resolvedReddit,
      developer_portal_url: "https://developers.reddit.com",
    };
    const drafted = baseGuide({
      developerPortalUrl: "https://developers.reddit.com/docs/oauth",
    });

    const result = enforceOfficialLinks(drafted, resolved);

    expect(result.developerPortalUrl).toBe("https://developers.reddit.com/docs/oauth");
    expect(result.developerPortalVerified).toBe(true);
  });

  it("marks the field unverified when no official domain can be confirmed at all", () => {
    const resolved: ResolvedApp = {
      canonical_name: "Reddit",
      official_domain: "",
      developer_portal_url: null,
      confidence: "low",
      corrected_from: null,
    };
    const drafted = baseGuide({
      website: "https://redditcommentscraper.com/article-reddit-pricing.html",
    });

    const result = enforceOfficialLinks(drafted, resolved);

    expect(result.websiteVerified).toBe(false);
  });
});

describe("scoreResult", () => {
  // JUNK_DOMAINS exists to deprioritize discussion/review sites for most
  // apps (a reddit.com thread about some other app's API is noise), but
  // reddit.com, x.com, linkedin.com and facebook.com are themselves real
  // companies — the exact bug: researching Reddit itself penalized
  // Reddit's own pages while giving an unrelated blog no penalty at all,
  // so the blog outranked Reddit's own docs.
  it("ranks the official domain above an unrelated blog, even when the official domain is also in JUNK_DOMAINS", () => {
    const officialDomains = ["reddit.com"];

    const officialScore = scoreResult(
      { url: "https://www.reddit.com/prefs/apps" },
      "reddit",
      officialDomains
    );
    const blogScore = scoreResult(
      { url: "https://octolens.com/blog/reddit-api-pricing" },
      "reddit",
      officialDomains
    );

    expect(officialScore).toBeGreaterThan(blogScore);
  });

  it("still deprioritizes a third-party domain when researching an unrelated app", () => {
    const officialDomains = ["notion.so"];

    const redditDiscussion = scoreResult(
      { url: "https://www.reddit.com/r/notion/comments/xyz" },
      "notion",
      officialDomains
    );
    const docsPage = scoreResult(
      { url: "https://developers.notion.com/docs/authorization" },
      "notion",
      officialDomains
    );

    expect(docsPage).toBeGreaterThan(redditDiscussion);
  });
});

describe("fillEvidenceDefaults", () => {
  // Gemini's JSON schema dialect doesn't reliably support nullable types
  // (see the comment on EVIDENCE_SCHEMA in agent.ts), so the model is
  // allowed to omit sourceUrl/note entirely — this normalizes that to the
  // explicit null lib/schema.ts's EvidenceSchema requires, before Zod
  // validation ever sees it.
  it("defaults a missing sourceUrl/note to null on a top-level evidence object", () => {
    const result = fillEvidenceDefaults({ level: "inferred" }) as Record<string, unknown>;
    expect(result.sourceUrl).toBeNull();
    expect(result.note).toBeNull();
  });

  it("treats an empty string the same as missing", () => {
    const result = fillEvidenceDefaults({
      level: "uncertain",
      sourceUrl: "",
      note: "",
    }) as Record<string, unknown>;
    expect(result.sourceUrl).toBeNull();
    expect(result.note).toBeNull();
  });

  it("leaves a populated evidence object untouched", () => {
    const result = fillEvidenceDefaults({
      level: "doc_sourced",
      sourceUrl: "https://example.com/docs",
      note: "stated directly",
    }) as Record<string, unknown>;
    expect(result.sourceUrl).toBe("https://example.com/docs");
    expect(result.note).toBe("stated directly");
  });

  it("recurses into nested objects and arrays (steps[].evidence, approval.paths[].evidence)", () => {
    const result = fillEvidenceDefaults({
      steps: [{ title: "Create app", evidence: { level: "hand_checked" } }],
      approval: { paths: [{ name: "Internal", evidence: { level: "uncertain" } }] },
    }) as {
      steps: { evidence: { sourceUrl: unknown; note: unknown } }[];
      approval: { paths: { evidence: { sourceUrl: unknown; note: unknown } }[] };
    };
    expect(result.steps[0].evidence.sourceUrl).toBeNull();
    expect(result.steps[0].evidence.note).toBeNull();
    expect(result.approval.paths[0].evidence.sourceUrl).toBeNull();
    expect(result.approval.paths[0].evidence.note).toBeNull();
  });

  it("defaults a missing/empty agentAssist to null without touching other fields", () => {
    const result = fillEvidenceDefaults({
      title: "Install app",
      agentAssist: "",
    }) as Record<string, unknown>;
    expect(result.agentAssist).toBeNull();
    expect(result.title).toBe("Install app");
  });
});
