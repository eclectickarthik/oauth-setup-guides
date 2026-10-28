# OAuth Setup Guides

A web app that helps a developer figure out how to set up a provider OAuth
app (Google, Slack, GitHub, etc.) and get it approved, so their AI agent's
users can connect that provider. It does **not** perform OAuth, handle
tokens, or create OAuth apps for anyone — it produces guides.

Two features:

1. **Library** — hand-checked guides for GitHub (easy), Slack (medium),
   Google (hard), LinkedIn (gated) — spanning the full difficulty range on
   purpose.
2. **Live generation** — type any app name or website, and an agent
   researches its developer docs and generates a new guide in real time,
   streamed to the UI, saved and shareable at `/guides/<slug>`.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the keys below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy

Standard Vercel deploy (`vercel deploy` or connect the repo in the
dashboard) — no special build config needed. One thing to set up first:

**Production needs `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.**
Without them, `getGuideStore()` falls back to writing JSON files under
`/data/generated` (`lib/store.ts`) — fine for local dev, but Vercel's
serverless functions don't share or persist a filesystem across
invocations, so every generated guide would vanish the moment the
function instance that created it is recycled. A free Upstash Redis
database (a few minutes to set up at
[upstash.com](https://upstash.com)) makes generated guides actually
persist and be shareable in production; the `UpstashGuideStore`
implementation is already written and picked automatically once those two
env vars are set, no code change needed.

Set all four env vars from `.env.example` (`GEMINI_API_KEY`,
`TAVILY_API_KEY`, the two Upstash ones) in the Vercel project settings
before the first deploy.
### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Drafts the guide JSON. Get one free at [aistudio.google.com](https://aistudio.google.com). |
| `TAVILY_API_KEY` | Yes | Searches and extracts provider developer docs. Free tier (1,000 credits/mo, no card) at [tavily.com](https://tavily.com). |
| `LLM_MODEL` | No | Defaults to `gemini-3.5-flash-lite`. Swappable without a code change. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | No | If unset, generated guides are stored as local JSON files under `/data/generated` (gitignored). |

## Key decisions

**Guide schema is the single source of truth.** `lib/schema.ts` defines the
`Guide` zod schema once; the library loader, the generation agent, and the
guide page all validate against or render from it. Every claim in a guide
carries an `evidence` tag (`tested` / `docs` / `uncertain`) and a source URL
(except `tested` claims, which don't need one) — shown as a badge in the UI,
not just stored.

**Hands-on setup time and approval/review wait time are always separate
fields.** A provider can be a 10-minute form with a 6-week review behind it
(Google, Slack) — collapsing those into one number hides the thing a
developer actually needs to plan around.

**The `decision` field exists because providers often have more than one
setup path with materially different tradeoffs** — GitHub OAuth App vs.
GitHub App, Google Internal/Testing/Production, Slack single-workspace vs.
Marketplace. When present, it renders above the steps so the developer
picks the right path before following anything else.

**Switched the generation agent from Claude to Gemini + Tavily mid-build.**
The original plan (CLAUDE.md's original spec) was Claude's web_search/
web_fetch tools. Two things forced a change, in order:

1. Ran out of Anthropic API credits live-testing the agent (~$2.50 burned
   on a handful of research runs — Opus + multi-round web_fetch is not
   cheap, and a transient network error caused one full silent retry).
2. Switched to Gemini. Its own Google Search grounding tool turned out to
   have **zero free quota** on the project, even though plain generation
   worked fine — isolated precisely by sending the same request with and
   without the grounding tool (confirmed via two matched `curl` calls: one
   got a normal response, the other got `429 exceeded current quota`).
   Enabling billing to unlock a tool that could be avoided wasn't worth it.

Final pipeline: **Tavily** (search + extract, free tier) finds and pulls
clean text from candidate pages, and **Gemini** (`gemini-3.5-flash-lite`,
via the Interactions API) only ever sees that plain extracted text — no
tools, no grounding — when drafting the guide, with `response_format`
enforcing the JSON schema and the fetched URLs passed explicitly as the
only sources it's allowed to cite.

**Tavily search results needed a relevance filter.** The first live run
(for "Linear") spent one of four extract calls on a Trustpilot review page
and pulled zero pages from Linear's own domain. Added a scoring pass before
extraction — penalize known junk domains (review sites, social media,
Wikipedia, Medium), reward domains containing doc-ish hints
(`docs`/`developer`/`api`) or the app's own slug — which fixed it: a
retest of the same input pulled all four pages from `linear.app/developers/*`.

**Generation is budgeted deterministically, not left to the model's
discretion.** Two fixed-pattern Tavily searches
(`"<app> OAuth app setup developer docs"` / `"<app> app review
verification"`), extraction capped at 4 pages, one Gemini drafting call
with one retry on schema-validation failure. This keeps cost and latency
predictable and keeps the whole run to roughly 20-40 seconds.

## What I learned / corrected

**Ambiguous provider names can resolve to the wrong product, and "OAuth" in
a doc's title doesn't mean end-user OAuth.** Generating a guide for "Apple"
initially surfaced the Apple Ads API — it literally says "OAuth 2.0" on the
page — instead of Sign in with Apple, the thing an agent builder actually
wants. The two are not interchangeable: Apple Ads uses the
`client_credentials` grant, which is server-to-server access to the
*developer's own* ad account. No end user is ever involved, no consent
screen, nothing to redirect. Presenting that as a normal OAuth setup guide
would have been actively misleading — correct docs, wrong API.

The fix had to happen at the search-query level, not just in the drafting
prompt, since prompting the model after the wrong pages were already
extracted can't recover information that was never fetched:

1. Reworded the primary research query to bias toward the end-user flow
   (`"sign in" OAuth user login authorization code`) instead of a bare
   `"<app> OAuth app setup"`, which matches whichever page says the word
   "OAuth" most prominently.
2. Added a resolve step: after extraction, if the pulled content reads like
   `client_credentials`/server-to-server access with no sign of
   `authorization_code` or a consent screen, the agent runs one more
   targeted search for `"Sign in with <app>"` before giving up.
3. Added an optional `warning` field to the guide schema. If every source
   still only documents `client_credentials` with no end-user consent step,
   the guide says so explicitly in a banner instead of silently presenting
   a server-to-server integration as if a user could connect their account.

Verified live: generating for "Apple" now finds Sign in with Apple
directly, and generating for "Apple Ads" specifically correctly sets the
warning ("This integration utilizes a client credentials / token exchange
flow... rather than an end-user authorization code consent grant") instead
of writing a normal-looking setup guide for it.

**This isn't fully solved, and it's worth saying so.** The "Apple" run
still blended Sign in with Apple together with an unrelated second product
(Device Management's account-driven enrollment OAuth flow) into one step
list, instead of picking one and naming the other out of scope — the
`decision` field exists for exactly this case but didn't fire. Apple
happens to have three OAuth-adjacent products under one name, which is an
unusually sharp edge case; the fix above resolves the specific failure mode
reported (wrong grant type entirely), not every possible multi-product
ambiguity a provider name can hide.

**The agent treated "pay-per-use, no free tier" as an open question
instead of the headline it should have been.** Testing the generated X
(Twitter) guide surfaced this directly: it said API keys were available
"immediately," never mentioned cost anywhere in the steps or requirements,
and buried the one pricing-related thing it did flag as a single vague
open question — "rate limits or tiered pricing for high-volume... requests"
— rather than a fact. The real situation, verified against X's own docs
(`docs.x.com/x-api/getting-started/pricing`, `docs.x.com/changelog`): since
February 6, 2026, new developers get no free API tier at all. Every call
is pay-per-use ($0.005/post read, $0.015/post created, a 3M-reads/month cap
before Enterprise terms kick in), free access exists only for case-by-case
approved "Public Utility" apps, and the old Basic ($200/mo) / Pro
($5,000/mo) subscriptions are closed to new signups. A developer following
the original guide would build the entire integration and then watch every
API call fail for a reason the guide never mentioned.

The fix is systemic, not a one-off edit to the X guide:

1. Added a required `accessCost` field to the schema — tier
   (free/freemium/paid), pricing model, rough rates, free-tier limits, and
   a source — separate from `time.setup`/`time.approvalWait` on purpose,
   the same way those two are already kept apart. It's required, not
   optional, specifically so a guide can't be drafted without the model
   having to state a position on cost.
2. Added a third, dated research query — `"<app> API pricing <current
   year> changes"`, with the year computed at request time — since a bare
   `"<app> API pricing"` search tends to surface tutorials and aggregator
   posts written before a pricing change, not the current terms.
3. Tightened the prompt: `openQuestions` is explicitly for things
   genuinely unverifiable, not a place to park a resolvable pricing
   question because it's easier than stating a number; billing/payment
   setup is always tagged a human step whenever `accessCost.tier` isn't
   free, since an agent can't enter payment details.
4. Evidence badges now link to the actual source URL for "docs" claims
   (or say "unverified" if a claim somehow has none) — a UI-level forcing
   function so a claim can't look as credible as a real citation without
   one.

Regenerating confirmed the `accessCost` field reliably fills in for a
second provider (Reddit: correctly identified as freemium, ~100
queries/min free, ~$0.24/1,000 calls or negotiated contracts for
commercial use, with contract negotiation correctly landed as a human
step) — but also surfaced an honest limitation: both the X and Reddit
regeneration runs pulled pricing info entirely from third-party
pricing-aggregator blogs, never the providers' own pricing pages, despite
the prompt's instruction to prefer official sources. The domain-ranking
heuristic (`lib/agent.ts`'s `JUNK_DOMAINS`/`DOC_HINTS`) catches review
sites and social platforms but doesn't recognize SEO content farms that
don't match either list. The final X library guide
(`data/guides/twitter.json`) is hand-sourced directly against
`docs.x.com` rather than shipped from the raw agent output for this
reason — the systemic fix (the cost field existing, the dated query
firing, billing landing as a human step) worked exactly as intended; the
source-quality gap for pricing-specific queries didn't, and is left here
as a known issue rather than claimed as solved.

**A misspelled app name could link to a third-party site instead of the
real one.** Testing with "reddddit" (a typo for Reddit) surfaced this: the
guide content was correctly about Reddit, but the "Website" link pointed
to `redditcommentscraper.com` and the page title rendered the raw typo.
The cause was structural, not a prompt-wording issue — search queries,
extraction, and link selection all ran directly on the raw user input, so
whatever ranked well for "reddddit" (a site whose domain happens to
contain the brand name) got treated as the app's own site.

The fix adds a dedicated identity-resolution phase before any
research/generation, plus a deterministic check that doesn't trust the
model's output on faith:

1. `lib/resolve.ts`'s `resolveApp()` runs first and asks the model to fix
   typos and name the real product's *own* domain — explicitly instructed
   to never return a third-party tool, scraper, wrapper, or review site,
   even one that would rank well in search. If confidence comes back low,
   it escalates to one Tavily search for confirmation before answering
   again. Every later step (search queries, drafting, the slug) uses this
   resolved `canonical_name`/`official_domain`, never the raw input.
2. `lib/domain.ts` adds a registrable-domain (eTLD+1) check via `tldts`.
   `enforceOfficialLinks()` in `lib/agent.ts` runs this against every
   drafted `website`/`developerPortalUrl` before a guide is ever returned:
   a brand name merely appearing inside a domain string (`reddit` inside
   `redditcommentscraper.com`) does not count as owning that domain. A
   failing URL falls back to `https://{official_domain}`, or is marked
   `websiteVerified: false` / `developerPortalVerified: false` (rendered
   as "(unverified)" in the UI) if even that can't be confirmed.
3. Low-confidence resolutions now pause before the expensive research run:
   the UI shows "Did you mean X?" with Yes / Search-anyway, instead of
   silently generating a guide for a guess.

Verified with unit tests (`lib/domain.test.ts`, `lib/resolve.test.ts`,
`lib/agent.test.ts`) that assert the exact failure mode directly:
`redditcommentscraper.com` is rejected and replaced with `https://reddit.com`
for a resolved Reddit identity, while an already-correct URL on the real
domain (or the developer portal's domain) is left untouched.

## Limitations

- **The agent pipeline is noticeably weaker than hand-tested guides**,
  documented concretely in `docs/validation.md`'s "Agent-Generated vs.
  Manual" section: running the live agent on "GitHub" missed the OAuth App
  vs. GitHub App decision entirely (the two fixed search queries never
  surfaced a GitHub Apps page), and running it on "Google" rated the
  difficulty "medium" instead of "hard" and never mentioned the CASA
  security assessment — the single most expensive part of the real
  process — because results skewed toward Google Home/Android docs instead
  of the general Identity Platform docs. The two-query strategy works well
  for single-product providers and is unreliable for broad, multi-product
  providers unless the input names the specific product (e.g. "Gmail API",
  not "Google").
- **The Slack, LinkedIn, and X guides are docs-researched, not hands-on
  tested** — every claim is marked `evidence: "docs"`, never `"tested"`,
  and `docs/validation.md` says so explicitly. They're weaker than the
  GitHub and Google guides for the same reason the agent's guides are: no
  firsthand account of what the actual UI looks like or what breaks in
  practice.
- **Pricing-specific research queries pull third-party content farms, not
  official pricing pages.** Regenerating X and Reddit both returned pricing
  info entirely from SEO aggregator blogs rather than `docs.x.com` or
  `redditinc.com` — the `JUNK_DOMAINS` list catches review sites and social
  platforms but has no way to recognize a content farm it's never seen. The
  `accessCost` field itself fills in correctly either way (the LLM still
  extracts the right numbers from blog summaries of official pricing), but
  the sourcing is weaker than it should be — this is why the X library
  guide was hand-sourced against `docs.x.com` rather than shipped from the
  raw agent output.
- **No retry/backoff on transient provider errors** (Tavily or Gemini
  5xx/network blips) beyond the one schema-validation retry already built
  in — a mid-run failure surfaces as an error in the UI rather than
  auto-recovering.
- **Slug collisions** between a generated guide and a library guide are
  resolved by appending `-generated` to the slug; there's no de-duplication
  across multiple generations of the same app.
