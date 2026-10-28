# CLAUDE.md — OAuth Setup Guides (Composio APM take-home)

## What this project is

A web app that helps developers set up a **provider OAuth app** (Google, Slack, GitHub, etc.) and get it approved, so their AI agent's users can connect that app.

It does NOT perform OAuth, handle tokens, or create OAuth apps for anyone. It produces **guides**.

Two features:

1. **Guide library** — hand-checked guides for 3–5 apps with different difficulty levels.
2. **Live generation** — a developer types any app name or website, an agent researches that app's developer docs, and a new guide is generated in real time with a shareable link.

## The developer's problem (keep this in mind for every decision)

Before launch, a developer often has to create an OAuth app with a provider and sometimes get it reviewed. Today they piece together docs and can't tell if it takes an hour or weeks. Every guide must answer:

- How hard is this? (easy / medium / hard / gated)
- How long? **Hands-on setup time is separate from approval wait time.** Never merge them.
- What do I need before starting? (verified domain, privacy policy, business entity, paid plan, demo video, etc.)
- What can an agent do for me, and where must I take over?
- What could block me, and what do I do about it?
- How sure is this information? (tested / from docs / uncertain)

## Tech stack

- Next.js (App Router) + TypeScript + Tailwind
- LLM: Google Gemini API (`@google/genai`, Interactions API) — a research call with Google Search grounding, then a drafting call with `response_format` JSON-schema enforcement. Switched from Claude mid-build after burning through Anthropic credits on live-testing; model name from env var `LLM_MODEL`, so it can be swapped
- Storage: library guides as JSON files in `/data/guides/`; generated guides in a simple key-value store (Upstash Redis or similar) behind a `GuideStore` interface, with a local JSON-file fallback for dev
- Streaming: Server-Sent Events from the generation endpoint so the UI shows agent progress live
- Deploy: Vercel

Keep it simple. No LangChain, no multi-agent orchestration, no auth system.

## Folder structure

```
/app
  /page.tsx                 # search box + library grid + "generate new guide" input
  /guides/[slug]/page.tsx   # shareable guide page
  /api/generate/route.ts    # starts agent, streams progress (SSE), saves result
/lib
  /agent.ts                 # agent loop, system prompt, tool config
  /schema.ts                # Guide type + zod schema (single source of truth)
  /store.ts                 # GuideStore interface + implementations
/data/guides/*.json         # hand-checked library guides
/docs/validation.md         # what was tested, corrected, or couldn't be verified
```

## Guide schema (lib/schema.ts is the source of truth)

```ts
type Evidence = "tested" | "docs" | "uncertain";

type Claim = {
  text: string;
  evidence: Evidence;
  sources: string[]; // URLs; required unless evidence === "tested"
};

type Step = {
  title: string;
  detail: string;
  actor: "agent" | "human"; // human = login, payment, legal, submitting for review, etc.
  evidence: Evidence;
  sources: string[];
};

type Guide = {
  slug: string;
  appName: string;
  website: string;
  developerPortalUrl: string;
  summary: string; // 2–3 sentences, plain language
  decision?: {
    // "choose first" fork, shown before steps
    question: string; // e.g. "OAuth App or GitHub App?"
    options: {
      name: string;
      pickWhen: string[];
      tradeoff: string;
    }[];
    recommendation: string;
  };
  difficulty: "easy" | "medium" | "hard" | "gated";
  difficultyReason: string;
  time: {
    setup: string; // e.g. "20–40 min"
    approvalWait: string; // e.g. "None for private use; 4–6 weeks for public"
    notes?: string;
  };
  whenReviewIsNeeded: Claim[]; // e.g. sensitive scopes, public distribution
  requirements: Claim[]; // things to have ready before starting
  steps: Step[];
  blockers: {
    problem: string;
    fix: string;
    evidence: Evidence;
    sources: string[];
  }[];
  agentCanDo: string[];
  humanMustDo: string[];
  openQuestions: string[]; // what couldn't be confirmed
  generatedBy: "manual" | "agent";
  lastVerified: string; // ISO date
};
```

Validate every agent output with zod. If validation fails, retry once with the error message, then return a clear failure to the UI.

## Agent rules (enforce in the system prompt)

- Start from the provider's **official developer docs**. Prefer official docs over blogs, forums, or third-party articles.
- Look specifically for: how to create the OAuth app, redirect URI rules, scopes, app review / verification / marketplace listing, rate limits, and any partner-program or paid-tier gate.
- **Every claim needs a source URL.** If something can't be found, mark it `uncertain` and add it to `openQuestions`. Never guess times or requirements.
- Keep setup time and approval wait separate.
- Tag every step `agent` or `human`.
- If the provider offers more than one app type or setup path (e.g. GitHub OAuth App vs GitHub App, Google Internal vs External, Slack single-workspace vs distributed), fill `decision` so the developer picks the right path before step 1.
- Limit the agent to a fixed budget of searches/fetches (e.g. 12) so generation finishes in about 1–2 minutes.
- Emit short progress events ("Searching for Calendly developer docs…", "Reading app review policy…") for the UI.
- Output only JSON matching the schema.

## Demo apps for the library (varied on purpose)

| App                  | Expected difficulty | Why                                                                           |
| -------------------- | ------------------- | ----------------------------------------------------------------------------- |
| GitHub               | easy                | Instant OAuth app, no review                                                  |
| Slack                | medium              | Instant for own workspace; Marketplace review to distribute                   |
| Google (Gmail/Drive) | hard                | Consent screen verification; restricted scopes may need a security assessment |
| LinkedIn or X        | gated               | Partner program or paid tier required                                         |

These are hypotheses. Confirm each by attempting the setup or reading official docs, and record corrections in `/docs/validation.md`.

## Conventions

- Plain, direct language in all user-facing text. Developers should understand a guide without anyone explaining it.
- Show evidence badges (tested / docs / uncertain) next to claims in the UI.
- Every guide page has a copy-link button and works without login.
- Small, focused commits with clear messages.

## Security

- API keys only in `.env.local` (gitignored). Provide `.env.example` with empty values.
- Never commit client secrets or tokens from any test OAuth apps.
- Sanitize the user's app-name input before using it in prompts or storage keys.

## Milestones

1. Scaffold Next.js app, schema, and store
2. Library: render guides from `/data/guides/*.json`
3. Write the 4 library guides (manual + tested)
4. Agent endpoint with streaming progress
5. Generated guides saved and shareable at `/guides/[slug]`
6. Validation: compare 2–3 agent guides with manual results, record in `/docs/validation.md`
7. README (setup, key decisions, limitations) and deploy to Vercel
