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
