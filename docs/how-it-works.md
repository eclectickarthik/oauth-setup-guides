# How live generation works

What actually happens, end to end, when someone types an app name or
website into the Generate tab. Four stages, each in its own file, each
independently testable.

```
input ──▶ resolve ──▶ research ──▶ draft ──▶ verify ──▶ store
        lib/resolve   lib/agent    lib/agent  lib/verifier  lib/store
          .ts            .ts (research())  .ts (draft())     .ts         .ts
```

Every stage streams progress back to the UI over SSE
(`app/api/generate/route.ts`), tagged with which service did the work
(`tavily` / `gemini` / `verifier`) so the "Show details" panel in
`components/GenerateForm.tsx` shows exactly what's happening, not a
generic spinner.

## 1. Resolve (`lib/resolve.ts`)

Turns the raw input ("reddddit", "notion.so", "Stripe") into a trusted
identity before anything else runs — **never** the raw string past this
point. One cheap Gemini call; escalates to one Tavily search only if
confidence comes back low. Produces `{ canonical_name, official_domain,
developer_portal_url, confidence, corrected_from }`.

- `confidence: "low"` and not yet confirmed → the route sends a `confirm`
  SSE event instead of continuing, and the UI shows "Did you mean X?"
  before spending anything on research.
- A slug match against the library or an existing generated guide short-
  circuits here too (`exists` / served-from-library `done`), so a repeat
  request never silently re-runs the whole pipeline.

## 2. Research (`lib/agent.ts`'s `research()`)

A **fixed, capped** search budget — not left to the model to decide how
much to look for, so cost and latency stay predictable:

1. **3 generic Tavily searches**, always the same shape:
   `"<app> sign in OAuth user login authorization code developer
   documentation"`, `"<app> app review verification"`, `"<app> API
   pricing <current year> changes"`.
2. **+1 domain-restricted search** (if resolve found an official domain)
   — same query text, scoped via Tavily's `include_domains` to the
   provider's own domain, so its real docs get found directly instead of
   hoping a generic search surfaces them over blogs/forums/Ads-API docs.
3. Every result is scored (`scoreResult()` — penalizes known junk domains
   and ads subdomains, rewards the official domain and doc-ish
   hostnames) and deduped; only the **top 5** (`INITIAL_EXTRACT_CAP`) get
   a full-text extract.
4. **2 conditional fallback checks** — if the extracted text never
   mentions review/verification or scope-tier language, one more
   targeted search fires (capped at 2 extra extracts). Same for a
   "this reads like client_credentials, not a real end-user flow" check.

Worst case: ~4-7 Tavily searches, ~5-9 extracts — bounded, not
open-ended.

## 3. Draft (`lib/agent.ts`'s `draft()` / `generateGuide()`)

**One Gemini call**, `DRAFT_SYSTEM` system prompt + the extracted page
text, `response_format` enforcing the JSON schema (`GUIDE_JSON_SCHEMA`,
hand-written to mirror `lib/schema.ts`'s `GuideSchema` exactly). **One
retry** if the output fails Zod validation, with the validation error
fed back so the model can self-correct.

Three deterministic, non-LLM safety nets run on the output before it's
considered a valid guide:

- `ensureAgentCanDo()` — if `agentCanDo` came back empty, fills it with a
  baseline list rather than shipping an empty array.
- `enforceOfficialLinks()` — checks `website`/`developerPortalUrl`
  against the resolved official domain (registrable-domain comparison,
  not string matching); replaces or marks `*Verified: false` on anything
  that doesn't actually belong to that domain.
- The slug is always re-derived from the *resolved* canonical name, never
  whatever the model drafted, so a typo'd input can't mint a duplicate
  guide under a different slug.

## 4. Verify (`lib/verifier.ts`'s `verifyGuide()`)

A second, independent pass over the already-valid drafted guide — not
part of drafting, a separate stage with its own prompt and its own cost:

1. Collects every unique `evidence.sourceUrl` cited anywhere in the
   guide (across every claim-bearing field) into one deduped list.
2. **One batched Tavily extract call** — all cited URLs in a single
   call, not one call per claim — to re-fetch their current text fresh.
3. **One Gemini call** (`VERIFY_SYSTEM` prompt) with the full drafted
   guide JSON plus that fresh page text, asked to:
   - confirm each claim still matches its source, or correct/downgrade
     it if it doesn't
   - try to upgrade `inferred`/`uncertain` claims to `doc_sourced` if any
     of the *other* fetched pages happens to support them
   - catch structural problems: wrong `oauthFit`, `agentCanDo` sneaking
     in token-handling/code tasks, information duplicated across fields
4. Response is `{ guide, changes, unverified }`, Zod-validated. **If
   validation fails, falls back to the pre-verification draft** (already
   known-valid) rather than risking a broken guide reaching the UI.
5. `changes` and `unverified` are attached to the guide and rendered as
   "What we changed after checking" / "Still unverified" sections.

Logged separately from drafting (`[verifier] "App": N Tavily call(s), M
Gemini call(s)`, same pattern as `[agent] ...`) — a deliberate, visible
cost addition, not folded into the drafting number.

## 5. Store (`lib/store.ts`)

`getGuideStore()` picks an implementation by what's configured:
Vercel Blob (`BLOB_READ_WRITE_TOKEN`) → Upstash Redis → local JSON files
under `/data/generated` (dev-only fallback, Vercel's filesystem is
read-only at runtime). Reads from Blob explicitly set `useCache: false`
— a guide needs to be readable the instant the client navigates to it
right after generation, and Vercel's CDN cache can otherwise serve a
stale "not found" for a few seconds after a fresh write.

## Evidence model (`lib/schema.ts`)

Every claim-bearing field carries an `Evidence` object, not just a flag:

```ts
{ level: "hand_checked" | "doc_sourced" | "inferred" | "uncertain",
  sourceUrl: string | null,
  note: string | null }
```

The generator and verifier are both explicitly told they can **never**
use `hand_checked` — neither has ever been hands-on with a provider's
real UI. Only a human-authored library guide (`data/guides/*.json`) can
claim that, and only on the specific claims that were actually tested.
