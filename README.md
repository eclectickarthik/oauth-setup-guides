# OAuth Setup Guides

**Live:** https://composio-assignment.eclectickarthik.com (password `composio`)
**Source:** https://github.com/eclectickarthik/oauth-setup-guides

Helps a developer figure out how to register and get approved for a
provider's OAuth app (Google, Slack, GitHub, etc.) so their users can
connect it through Composio. It does **not** perform OAuth or handle
tokens — it produces guides.

1. **Library** — two hand-checked guides, GitHub (easy) and Google
   (hard) — `evidence.level: "hand_checked"` only on claims actually
   verified against the real provider UI. See `docs/validation.md`.
2. **Live generation** — type any app name or website; an agent
   researches it, drafts a guide, a second pass verifies the draft
   against its own sources, and the result streams to the UI and saves
   at `/guides/<slug>`.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the keys below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), password `composio`.

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Drafts and verifies guides. Free at [aistudio.google.com](https://aistudio.google.com). |
| `TAVILY_API_KEY` | Yes | Research. Free tier at [tavily.com](https://tavily.com). |
| `BLOB_READ_WRITE_TOKEN` | No | Persists generated guides (Vercel Blob). Without it, or `UPSTASH_REDIS_REST_URL`/`TOKEN`, falls back to local JSON files under `/data/generated` — fine for dev, not on Vercel's read-only filesystem. |
| `SITE_PASSWORD` | No | Access-gate password. Defaults to `composio`. |

Deployed via the Vercel CLI; standard `vercel deploy` also works.

## Key decisions

- **One zod schema** (`lib/schema.ts`) is the single source of truth for
  library guides, generated guides, and the UI. Every claim carries a
  4-level `evidence` ({hand_checked, doc_sourced, inferred, uncertain} +
  source URL) — the generator can never claim `hand_checked`.
- **Setup time, approval wait, and cost are always separate fields** — a
  provider can be a 10-minute form with a 6-week review behind it.
- **A `decision` field** renders above the steps whenever a provider has
  more than one setup path (GitHub OAuth App vs. GitHub App, Google
  Internal vs. External) — picked before anything else.
- **`agentCanDo`/`humanMustDo` cover app registration, not OAuth code** —
  Composio handles token exchange/refresh, so the agent's job is
  finding the console, pre-filling the registration form, checking
  prerequisites, and drafting review submissions, never writing
  integration code.
- **Generation runs through Tavily (search + extract) + Gemini**, not
  Claude as originally planned — switched after burning Anthropic
  credits live-testing, then finding Gemini's own search-grounding tool
  had zero free quota. Gemini only ever sees plain extracted text.
- **A verifier pass** re-fetches every source the draft cited and
  corrects/downgrades claims that don't hold up before the guide is
  shown — logged and cost-tracked separately from drafting.
- Budgeted deterministically (fixed search queries, capped extracts, one
  retry on schema failure) to keep each generation predictable, ~20–60s.
- **`composioHandoff`** (the guide's final step) states Composio's real
  callback URL and bring-your-own-credentials dashboard flow — verified
  against `docs.composio.dev` directly, not assumed from the spec.

Full debugging history — every real bug found by testing generated
guides, root cause, fix, and what's still not fully solved — is in
[`docs/learnings.md`](docs/learnings.md).

## Limitations

- **X (Twitter) and Reddit are intentionally out of scope** — both run
  anti-bot defenses against the kind of fetching this agent does, a
  structural problem no query tuning fixes. See `docs/learnings.md` for
  what was tried.
- **The agent is noticeably weaker than hand-tested guides** — e.g. it
  misses GitHub's OAuth-App-vs-GitHub-App decision and under-rates
  Google's difficulty, because the two fixed research queries don't
  reliably surface the right page for broad, multi-product providers.
  Details in `docs/validation.md`.
- **The verifier isn't flawless** — it's caught and fixed real problems
  live (wrongly agent-tagged steps, duplicated content) but has also
  over-corrected at least once. Not claimed as a solved problem.
- **No retry/backoff** on transient Tavily/Gemini errors beyond one
  schema-validation retry on drafting.
- Generated-guide slugs colliding with a library slug get `-generated`
  appended; no de-duplication across repeat generations of the same app
  beyond the existing-guide confirm prompt.
