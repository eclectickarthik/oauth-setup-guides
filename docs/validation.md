# Validation

What was tested, corrected, or couldn't be verified for each library guide,
compared against the original hypothesis in `CLAUDE.md`.

## GitHub

Tested 2026-10-28 by Karthik (manual setup, personal account). Covered both
the OAuth App and GitHub App paths.

**Confirmed**

- No approval/review step to create or use an OAuth App — matches the
  "easy" hypothesis.
- Required fields for an OAuth App: Application name, Homepage URL, at
  least one Redirect URI.
- Up to 10 redirect URIs are allowed per OAuth App.
- Token expiry ("Expire user access tokens") is on by default and issues a
  refresh token.
- Homepage URL is not verified — any well-formed URL works, including
  `http://localhost:3000`.
- Client ID is shown immediately after registration; the client secret
  must be generated separately via "Generate a new client secret" and is
  shown once with a copy button.
- You cannot delete your only client secret — rotation requires adding a
  new one, swapping it in, then deleting the old one.
- GitHub App setup took ~7 min on a second attempt (fields already learned
  from the OAuth App flow); a first-timer should expect 10-15 min. A
  GitHub App is not live until it's installed on an account — an extra
  step OAuth Apps don't have.

**Corrected**

- Original claim: "Rate limits for OAuth apps are higher once a user has
  authorized, and GitHub may ask you to verify your app's identity only if
  you request certain org-level permissions." Removed — no verification
  step was seen during OAuth App setup, and the higher/scaling rate limits
  apply to GitHub Apps, not OAuth Apps. The original claim was muddled and
  unsourced.
- Setup time narrowed from "10-15 min" to "5-10 min" for the OAuth App
  path, based on a measured 16 min first attempt (including off-topic
  time) and a focused estimate of 8-10 min.
- Added a decision point (OAuth App vs. GitHub App) that the original
  guide didn't surface — the two paths have materially different setup
  time, access model, and recommended use case.

**Couldn't verify**

- Whether the client secret is shown only once (didn't check by reloading
  the page).
- Exact setup time for an experienced developer — 3-5 min is an estimate,
  not tested.
- Whether listing an app on the GitHub Marketplace adds a review step.

## Google

Tested 2026-10-28 by Karthik (manual setup, personal Gmail account, project
"Composio Test"). Tester had prior experience with basic Google sign-in
OAuth, but Gmail scopes, the unverified-app warning, and
publishing/verification were new in this test.

**Confirmed**

- No review is needed in Testing mode (Internal or External with up to 100
  test users) — matches the "hard" hypothesis only once you move toward
  production with sensitive scopes.
- The current console UI splits the old single "OAuth consent screen"
  page into Overview, Branding, Audience, Clients, Data access,
  Verification centre, and Settings, inside "Google Auth Platform."
- Required initial fields: app name, user support email (shown to users),
  audience choice (Internal/External), and developer contact email.
- External Testing mode caps sign-ins at 100 test users, added by hand,
  counted over the app's lifetime.
- OAuth client fields include Authorised JavaScript origins, Authorised
  redirect URIs, and a "Use this client for an AI-powered agent" checkbox
  (off by default). Domains from the redirect URIs are auto-added to
  authorised domains. Client secrets are masked after creation (last 4
  characters shown) and can be rotated without downtime.
- The unverified-app warning ("Google hasn't verified this app") appeared
  for the `gmail.readonly` scope but not for `userinfo.email` on the same
  Testing-mode app — it depends on scope sensitivity, not Testing mode
  itself.
- Uploading a logo to Branding alone triggers the verification
  requirement, even for an app using only basic scopes. Verification is
  also required for more than 10 domains or for sensitive/restricted
  scopes.
- Three errors were hit and resolved directly: a `redirect_uri_mismatch`
  caused by an http/https scheme mismatch; a 403 `access_denied` caused by
  signing in with an account not on the test user list; and an
  unexplained "Ineligible accounts not added" popup when re-adding a test
  user already on the list.

**Corrected**

- Original claim: "Users click 'Advanced > Go to app (unsafe)' to get past
  the unverified app screen." Corrected — for test users, the current
  screen instead says the app is being tested and offers a plain Continue
  button.
- Original claim: "Adding scopes in the console is needed before you can
  request them." Corrected — in Testing mode, a scope not declared under
  Data access (`gmail.readonly`) was still requested and granted via the
  authorization URL; Data access is a declaration for verification, not a
  permission gate.
- Added a three-way decision (Internal / External Testing / External
  Production) that the original "hard" hypothesis didn't break out —
  Testing mode is actually easy and instant; the "hard" part is specific
  to production with sensitive or restricted scopes.
- Added that restricted scopes (e.g. Gmail) require a paid third-party
  CASA security assessment in addition to verification — a cost and
  timeline the original hypothesis didn't mention. Sourced from official
  docs, not tested directly (see openQuestions).

**Couldn't verify**

- Exact Data access tier shown for `gmail.readonly` (not added during this
  test; docs list it as restricted).
- Whether the unverified-app warning reappears for `gmail.readonly` on a
  repeat sign-in attempt, or only shows once.
- What the "AI-powered agent" client setting actually changes — enabling
  it produced no visible effect in this test.
- Whether "Make internal" works on a personal Gmail project without a
  Workspace org.
- Full list of required Branding fields before publishing.
- What the consent screen looks like once an app is fully verified.
- Verification timeline for sensitive/restricted scopes, CASA cost and
  duration, refresh token lifetime in Testing mode, and the requirement to
  enable the Gmail API before calling it — not tested directly, taken
  from official Google documentation (cited in `data/guides/google.json`).

## Slack

Researched 2026-10-28 from official docs only (docs.slack.dev, api.slack.com)
— not hands-on tested, unlike the GitHub and Google guides above. Every claim
in `data/guides/slack.json` is marked `evidence: "docs"`, never `"tested"`.

**Confirmed from docs**

- Installing an app to its own workspace requires no review and works
  immediately — matches the "medium" hypothesis's easy half.
- Listing in the Slack Marketplace is a two-phase review: up to 10 business
  days for a preliminary review, then up to 10 weeks for new submissions (6
  weeks for resubmissions) — cannot be expedited.
- Marketplace submission requires 10+ active installs (used in the last 28
  days), sustained through the entire review, *before* you can submit.
- Redirect URIs must be HTTPS with no anchor (#), and must match or be a
  subdirectory of a URL configured in OAuth & Permissions.

**Corrected**

- Nothing to correct against — this is a new guide, not a revision of an
  existing hypothesis.

**Couldn't verify**

- Exact hands-on setup time (not stated in official docs; the guide's
  estimate is based on step count, not a documented figure).
- Whether rate limits or a paid tier gate any part of app creation or
  Marketplace listing.
- The full scope list considered "extensive access" or "restricted" for
  Marketplace eligibility, beyond the three named examples in the docs.

This guide is weaker than GitHub's and Google's precisely because it's
docs-only: no firsthand account of what the actual OAuth app creation form
looks like, what errors a developer hits, or whether the documented steps
match the current UI. It's included to complete the four-guide difficulty
spread (easy/medium/hard/gated) from `CLAUDE.md`, not as a claim that
docs-research alone is equivalent to testing.

## Agent-Generated vs. Manual

Milestone 6: ran the live-generation agent (Tavily search + extract, then
Gemini drafting — see `CLAUDE.md`) on "GitHub" and "Google" and compared the
output against the hand-tested guides above. Both agent runs are saved
under `data/generated/` (gitignored) as `github-generated.json` and
`google-generated.json`.

### GitHub (agent) vs. GitHub (manual)

**Matched well**

- Difficulty: agent said "easy", matches the tested guide.
- Setup time: agent said "5 minutes"; tested guide says "5-10 min" — close.
- Core steps (Developer settings → New OAuth App → fill fields → register)
  match what was actually tested.
- The agent surfaced one new, correctly-sourced detail the manual guide
  didn't have: a verified-email requirement before authorizing OAuth apps.

**Diverged**

- The agent's guide has **no OAuth App vs. GitHub App decision at all** —
  it only describes the classic OAuth App flow. The manual guide's single
  most useful addition (the decision point, since the two paths have very
  different access models and setup times) is entirely missing from the
  agent version. The two Tavily searches ("GitHub OAuth app setup developer
  docs" / "GitHub app review verification") didn't surface a GitHub Apps
  page in the top 4 extracted results.
- `agentCanDo` and `blockers` are both empty in the agent's guide. The
  extracted pages covered app *registration* but not the authorization-flow
  implementation page, so the model had nothing to draw an "agent can
  implement the token exchange" step from, and no firsthand friction to
  report as blockers (homepage-vs-redirect-URI confusion, the
  can't-delete-your-only-secret rule, etc. — all things the manual test
  caught that no doc page states outright).
- The agent flagged a specific rate limit ("10 tokens per user/application/
  scope combination per hour") that the manual test never checked — a
  plausible lead worth verifying, not a contradiction.

**Takeaway:** for a provider with two distinct app types, generic search
queries that don't name both types by name will likely miss the
less-obvious one. The decision field is the single highest-value piece of
a guide and is exactly the part a docs-only agent run is least likely to
get right without query tuning.

### Google (agent) vs. Google (manual)

**Matched well**

- Both identify OAuth consent screen configuration, domain verification,
  and a review path as the core complexity.
- Both correctly separate "no review needed" from "review needed for
  external/published apps."

**Diverged — this is the more serious gap**

- Agent said difficulty **"medium"**; the manually tested guide says
  **"hard"**. The agent's guide never mentions restricted scopes, Gmail, or
  the CASA security assessment at all — the single most expensive and
  time-consuming part of the real process (a paid third-party security
  audit, $500-$4,500, 2-6+ weeks, redone annually) is completely absent.
- Agent said approval wait is "2-3 business days"; the manual guide found
  sensitive-scope verification alone takes ~10 business days, before
  restricted-scope CASA is even factored in — the agent's number is a
  significant underestimate.
- No Internal/Testing/Production decision field was generated, even though
  Google clearly has that structure — the extracted pages (brand
  verification, Workspace Marketplace review, and a Google Home/Android
  OAuth page) didn't describe the three-way split clearly enough for the
  model to surface it.
- Sources skew toward **Google Home / Android** OAuth docs
  (`developers.home.google.com`) rather than the general Google Identity
  Platform docs a web/API integration actually needs — the query
  "Google OAuth app setup developer docs" is ambiguous for a company as
  broad as Google, and the domain-ranking heuristic (favoring any
  `developers.*` host) couldn't tell "the right Google docs" from
  "a Google docs page."

**Takeaway:** the agent pipeline degrades badly on broad, multi-product
providers unless the query names the specific product/API (e.g. "Gmail
API" rather than "Google"). This is a real, known limitation of the
current two-fixed-query search strategy — it works well for single-product
providers (GitHub, Linear, Figma) and is unreliable for umbrella brands
without a more specific input than just the company name.
