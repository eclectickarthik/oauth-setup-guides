# OAuth Setup Guides

A web app that helps a developer figure out how to set up a provider OAuth
app (Google, Slack, GitHub, etc.) and get it approved, so their AI agent's
users can connect that provider. It does **not** perform OAuth, handle
tokens, or create OAuth apps for anyone — it produces guides.

Two features:

1. **Library** — hand-checked guides for GitHub (easy), Slack (medium),
   Google (hard), spanning the difficulty range on purpose.
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
- **The Slack guide is docs-researched, not hands-on tested** — every claim
  is marked `evidence: "docs"`, never `"tested"`, and `docs/validation.md`
  says so explicitly. It's weaker than the GitHub and Google guides for
  the same reason the agent's guides are: no firsthand account of what the
  actual UI looks like or what breaks in practice.
- **No retry/backoff on transient provider errors** (Tavily or Gemini
  5xx/network blips) beyond the one schema-validation retry already built
  in — a mid-run failure surfaces as an error in the UI rather than
  auto-recovering.
- **Slug collisions** between a generated guide and a library guide are
  resolved by appending `-generated` to the slug; there's no de-duplication
  across multiple generations of the same app.
