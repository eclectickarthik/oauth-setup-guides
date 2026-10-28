# What I learned / corrected

Full debugging history for the live-generation agent — every real bug found
by actually testing generated guides, the root cause, the fix, and what's
still not fully solved. Moved out of the main README to keep that short;
this is the detailed version referenced from its "Key decisions" and
"Limitations" sections.

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
   setup is always tagged a human step whenever cost isn't free (field
   later renamed from `accessCost.tier` to `cost` — see the schema
   redesign entry below), since an agent can't enter payment details.
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
don't match either list. Hand-correcting the generated X guide against
`docs.x.com` directly (rather than shipping the raw agent output) showed
the systemic fix worked exactly as intended — the cost field existing,
the dated query firing, billing landing as a human step — while the
source-quality gap for pricing-specific queries didn't; X isn't part of
the shipped library, so this is left here as a finding from live-testing
the generation agent, not a claim about a shipped guide.

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

**The link-level fix above still left the research step reading
third-party blogs for Reddit's own guide.** Live-testing right after the
fix above still showed `accessCost`/`requirements`/`steps` all sourced
from `redditcommentscraper.com`, `octolens.com`, `painonsocial.com`, and
similar pricing-aggregator blogs — the "Website" link was correct now, but
the guide's actual content wasn't. The cause: `lib/agent.ts`'s
domain-ranking heuristic (`JUNK_DOMAINS`) treats `reddit.com`, `x.com`,
`linkedin.com`, and `facebook.com` as junk by design, since a Reddit
discussion thread about some *other* app is noise — but that penalizes a
provider's own pages whenever the provider being researched *is* one of
those four companies, while giving unrelated blogs no penalty at all.

Fixed by giving the resolved official domain (from the same `resolveApp()`
step as the link fix) priority in search, not just in scoring:
`scoreResult()` now checks the official/developer-portal domain first via
the same registrable-domain comparison as `enforceOfficialLinks`, and
`research()` runs one additional Tavily search restricted to that domain
(`include_domains`) so the provider's real docs get found directly instead
of hoping a generic web search surfaces them. A first version of this
domain-restricted search used a generic "OAuth API documentation" query,
which pulled in Reddit's **Ads API** docs over its regular Data API — the
same right-domain-wrong-product failure mode as the Apple Ads case above
— fixed by reusing the same end-user-facing query bias as the primary
search instead of a bare generic one.

Verified live via `npm run generate -- Reddit`: sources for pricing,
requirements, and steps now come from `developers.reddit.com` and
`ads-api.reddit.com`, not from any scraper/blog domain. Covered by a new
`scoreResult` unit test in `lib/agent.test.ts` asserting the official
domain outranks an unrelated blog for its own guide, while still being
deprioritized when it's irrelevant to a *different* app's guide (e.g. a
Reddit thread when researching Notion).

**Even with the above, Reddit specifically still drafted the Ads API,
not the main Data API — and this part isn't fully solved.** Debugging
with `npm run generate -- Reddit` again after the fix above traced it to
two compounding, Reddit-specific facts that no generic heuristic can
know without being told: (1) `reddit.com/dev/api/oauth` — the page that
ranks best once restricted to the official domain — is a thin API
*conventions* reference (pagination, modhashes, fullnames), not an OAuth
setup walkthrough; the actual community-maintained walkthrough has lived
for years at `github.com/reddit-archive/reddit/wiki/oauth2`, off Reddit's
own domain entirely. (2) The Ads API's docs are simply more thorough and
keyword-dense for "OAuth"/"authorization" than anything else on
reddit.com, so once two more generic improvements were added — ranking
candidates only by domain-search provenance (not just by sharing a
hostname, since an unrestricted "review verification" search on Reddit
also surfaces unrelated reddit.com forum threads) and a generic ads-
subdomain deprioritization (reused `isAdsSubdomain` penalty, since
Facebook/LinkedIn/X/Pinterest have the same "separate, better-documented
Ads API" shape) — the Ads docs still had the best content once extracted,
and Gemini drafted from the richer material available.

Left as a documented limitation rather than special-cased, in keeping
with how the Apple Ads case above was handled: hardcoding a trust
exception for one GitHub wiki page for one provider isn't a generalizable
fix, it's a lookup table pretending to be one. The generalizable pieces
of this round's fix (own-domain forum noise, ads-subdomain
deprioritization, domain-restricted search) are real and verified; "a
company's real canonical docs live on a different domain than the
company's own" is a genuinely hard case for a resolve step whose job is
to find the official *domain*.

**`agentCanDo` was scoped to the wrong job.** Every generated (and
originally every hand-checked) guide's `agentCanDo` listed things like
"build the authorization URL," "implement the callback handler," and
"exchange the code for a token" — and every guide's step list ended with
an agent-tagged "Implement the authorization flow" step. That's wrong
for this product: a developer using Composio never writes that code —
Composio manages the actual authorization flow, token exchange, storage,
and refresh once an app is registered. Telling the reader an agent will
"implement the callback handler" describes work that's already done and
not theirs to do, and listing "authorize the app via the consent screen"
as a setup step (present in earlier agent output) conflates the
developer's one-time registration with the end user's later connection
— two different people, two different moments.

Fixed in both places this showed up:

1. `lib/agent.ts`'s `DRAFT_SYSTEM` prompt now states the scope explicitly
   — this guide covers registering, configuring, and getting approval
   for the OAuth app, never writing OAuth code — and gives the model the
   actual categories: `agentCanDo` is for finding the developer console
   and current form fields, pre-filling registration values, checking
   submission prerequisites (privacy policy, logo specs, verified
   domain), and drafting review/verification submission text;
   `humanMustDo` is for owning the account, accepting terms/paying,
   submitting for review and waiting, and handing the client secret to
   Composio. `BASELINE_AGENT_CAN_DO` (the code-level fallback for an
   empty `agentCanDo`) was rewritten to match.
2. The hand-checked library guides (`data/guides/*.json`) had the exact
   same issue, being hand-authored before the scope was corrected — each
   one's `agentCanDo` and final "Implement the authorization flow"-style
   step were rewritten to match (e.g. GitHub's step now reads "Hand off
   the client ID and secret to Composio").

Verified by regenerating Linear (`npm run generate -- Linear`) after the
fix: `agentCanDo` now reads "Find the developer console navigation path
and current registration fields," "Pre-fill the registration form
values," "Check submission prerequisites," "Draft the integration
description and use-case details for directory review" — no OAuth-code
tasks anywhere, and the step list ends at "Submit to the Linear
integration directory," not an implementation step.

**Schema redesign: structured evidence, a verifier pass, and an explicit
OAuth-fit classification.** The `agentCanDo` fix above addressed one
specific overclaim; a broader pass rebuilt the schema and pipeline around
the same underlying principle — don't assert more than was actually
checked, and be explicit about what's different between providers rather
than flattening it into free text:

1. **Structured evidence** (`lib/schema.ts`'s `Evidence`) replaced the
   flat `tested`/`docs`/`uncertain` enum with a 4-level scale
   (`hand_checked`/`doc_sourced`/`inferred`/`uncertain`) plus a
   `sourceUrl`/`note` on every claim, not just a shared `sources[]`
   array. The generator is explicitly told it can never use
   `hand_checked` (it was never hands-on with any provider's UI) — only a
   human-authored library guide can claim that.
2. **A verifier pass** (`lib/verifier.ts`) now runs after every
   generation: it re-fetches every URL the draft actually cited (one
   batched Tavily extract call) and asks the model to confirm each claim
   against the fresh page text, correcting or downgrading evidence that
   doesn't hold up, flagging any `agentCanDo`/`humanMustDo` entry that
   violates the Composio-scoping rule, and listing what it still
   couldn't verify. One extra Tavily call and one extra Gemini call per
   generation — a deliberate cost increase, not a free addition, logged
   the same way `generateGuide`'s own call counts already are.
   Live-tested on Apple: the verifier caught and fixed real problems in
   the draft — it restricted several steps the draft had marked
   agent-doable (interacting with Apple's consent/portal UI) down to
   human-only, and stripped a duplicated "hand off to Composio" sentence
   the draft had put in both a step description and the dedicated
   `composioHandoff` field. It was also sometimes *overly* conservative
   — on one Google regeneration it stripped "pre-fill form fields" from
   `agentCanDo` entirely, even though pre-filling is explicitly an
   allowed category in the prompt; this isn't claimed as fully solved,
   just caught and left as a known rough edge rather than hidden.
3. **`oauthFit`** (`standard_oauth`/`oauth_with_caveats`/`sign_in_only`/
   `no_oauth`) replaces the old free-text `warning` field, and a new
   `surface`/`otherSurfaces` split makes the "which product does this
   guide actually cover" decision explicit instead of folding it into
   the summary. Live-tested on Apple, which has at least three
   OAuth-adjacent surfaces (Sign in with Apple, the App Store Connect
   API, Apple Ads): the result correctly listed the other two as
   `otherSurfaces` with reasons they weren't chosen, but merged the
   first two into a single `surface` string ("Sign in with Apple / App
   Store Connect API") instead of picking one, and classified the result
   as `standard_oauth` rather than `sign_in_only` — arguably wrong, since
   Sign in with Apple itself is identity-only with no general data API
   behind it. The structural pieces (explicit classification, explicit
   alternatives list) work; getting the classification itself right on
   a provider with several genuinely blended surfaces is still an open
   problem, consistent with the Apple Ads finding earlier in this
   section.

**The `composioHandoff` field described Composio's own behavior without
ever having checked Composio's own docs for it.** Every guide's final
field said some version of "paste the client ID and secret into Composio,
with Composio's callback URL registered as the redirect URI" — accurate
in spirit (this app's whole premise, that Composio manages the OAuth
runtime, came from the original assignment spec), but the specific
mechanics were never verified against Composio's actual product, the one
thing this project never ran through its own research pipeline. Asked
directly whether this was checked — it hadn't been.

Fetched Composio's own docs (`docs.composio.dev`) to check: confirmed
Composio does support bringing your own OAuth app, but the real mechanics
are more specific than the guide said — the actual callback URL is
`https://backend.composio.dev/api/v3/toolkits/auth/callback`, and it's not
just "paste into Composio" but a specific dashboard flow (select the
OAuth2 scheme, enable "Use your own developer credentials", enter client
ID/secret/redirect URI to create an auth config). Updated both library
guides' `composioHandoff` field to the verified text, and updated
`DRAFT_SYSTEM` in `lib/agent.ts` to state the real URL and flow explicitly
so future live-generated guides get this right from the start rather than
describing Composio vaguely.
