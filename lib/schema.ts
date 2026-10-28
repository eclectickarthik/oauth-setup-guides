import { z } from "zod";

// Guide schema — single source of truth for the shape of an OAuth setup
// guide. Both library guides (/data/guides/*.json) and agent-generated
// guides are validated against this before they're stored or rendered.
//
// This guide is about REGISTERING, CONFIGURING, AND GETTING APPROVAL FOR
// an OAuth app with a provider so a developer can connect it through
// Composio — never about writing OAuth integration code. Composio handles
// the actual authorization flow, token exchange, storage, and refresh; a
// developer using Composio never implements that themselves. See
// lib/agent.ts's DRAFT_SYSTEM and the README's "What I learned /
// corrected" entry for why that distinction exists and what it replaced.

// Four levels instead of the old flat tested/docs/uncertain: "doc_sourced"
// and "inferred" used to both collapse into "docs", losing the difference
// between "a doc states this directly" and "I concluded this from
// context." A claim's evidence is always this one object, not a enum plus
// a separate optional sources array — a URL only makes sense attached to
// its specific claim, and only doc_sourced is required to have one.
export const EvidenceLevelSchema = z.enum([
  "hand_checked",
  "doc_sourced",
  "inferred",
  "uncertain",
]);
export type EvidenceLevel = z.infer<typeof EvidenceLevelSchema>;

export const EvidenceSchema = z
  .object({
    level: EvidenceLevelSchema,
    sourceUrl: z.string().url().nullable(),
    note: z.string().nullable(),
  })
  .refine((val) => val.level !== "doc_sourced" || val.sourceUrl !== null, {
    message: "doc_sourced evidence must carry a sourceUrl",
    path: ["sourceUrl"],
  });
export type Evidence = z.infer<typeof EvidenceSchema>;

export const DifficultySchema = z.enum(["easy", "medium", "hard", "gated"]);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const DecisionSchema = z.object({
  question: z.string().min(1),
  options: z
    .array(
      z.object({
        name: z.string().min(1),
        pickWhen: z.array(z.string().min(1)),
        tradeoff: z.string().min(1),
      })
    )
    .min(1),
  recommendation: z.string().min(1),
});
export type Decision = z.infer<typeof DecisionSchema>;

// A provider can have multiple OAuth-adjacent surfaces (e.g. Apple Ads vs.
// Sign in with Apple) — the resolve step in lib/agent.ts picks ONE to
// write the guide about and records what else it considered here, so the
// reader knows other surfaces exist rather than assuming this is the only
// one. oauthFit replaces the old free-text "warning" field: a provider
// that's API-key-only, or OAuth-for-identity-only, now gets a structured
// classification instead of an ad-hoc banner.
export const OtherSurfaceSchema = z.object({
  name: z.string().min(1),
  whyNot: z.string().min(1),
});
export type OtherSurface = z.infer<typeof OtherSurfaceSchema>;

export const OAuthFitValueSchema = z.enum([
  "standard_oauth",
  "oauth_with_caveats",
  "sign_in_only",
  "no_oauth",
]);
export type OAuthFitValue = z.infer<typeof OAuthFitValueSchema>;

export const OAuthFitSchema = z.object({
  value: OAuthFitValueSchema,
  reason: z.string().min(1),
});
export type OAuthFit = z.infer<typeof OAuthFitSchema>;

export const ValueWithEvidenceSchema = z.object({
  value: z.string().min(1),
  evidence: EvidenceSchema,
});
export type ValueWithEvidence = z.infer<typeof ValueWithEvidenceSchema>;

// Separate from setup time on purpose — a provider can be a 10-minute form
// with a 6-week review behind it. "paths" because approval often isn't
// one number: internal use, a public listing, and a verified/restricted
// tier commonly have different review requirements and different waits
// for the same provider, and collapsing them into one figure hides
// exactly the thing a developer needs to plan around.
export const ApprovalPathSchema = z.object({
  name: z.string().min(1),
  reviewRequired: z.boolean(),
  wait: z.string().min(1),
  notes: z.string(),
  evidence: EvidenceSchema,
});
export type ApprovalPath = z.infer<typeof ApprovalPathSchema>;

export const ApprovalSchema = z.object({
  paths: z.array(ApprovalPathSchema).min(1),
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const CostSchema = z.object({
  value: z.string().min(1),
  notes: z.string(),
  evidence: EvidenceSchema,
});
export type Cost = z.infer<typeof CostSchema>;

export const PrerequisiteSchema = z.object({
  text: z.string().min(1),
  evidence: EvidenceSchema,
});
export type Prerequisite = z.infer<typeof PrerequisiteSchema>;

export const ScopeItemSchema = z.object({
  scope: z.string().min(1),
  why: z.string().min(1),
});
export type ScopeItem = z.infer<typeof ScopeItemSchema>;

export const ScopeModeSchema = z.object({
  name: z.string().min(1),
  whenToUse: z.string().min(1),
});
export type ScopeMode = z.infer<typeof ScopeModeSchema>;

export const ScopesSchema = z.object({
  minimum: z.array(ScopeItemSchema),
  optional: z.array(ScopeItemSchema),
  modes: z.array(ScopeModeSchema),
  evidence: EvidenceSchema,
});
export type Scopes = z.infer<typeof ScopesSchema>;

// "owner" replaces the old "actor" naming to make room for "both" (a step
// a human must start — logging in — that an agent can finish once past
// the login/payment wall, e.g. pre-filling the rest of the form).
// agentAssist is a one-line note on what the agent can specifically do on
// a "human"/"both" step; null when there's nothing agent-assistable about
// it (e.g. "accept developer terms").
export const StepOwnerSchema = z.enum(["human", "agent", "both"]);
export type StepOwner = z.infer<typeof StepOwnerSchema>;

export const StepSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  owner: StepOwnerSchema,
  agentAssist: z.string().nullable(),
  evidence: EvidenceSchema,
});
export type Step = z.infer<typeof StepSchema>;

export const BlockerSchema = z.object({
  problem: z.string().min(1),
  fix: z.string().min(1),
  evidence: EvidenceSchema,
});
export type Blocker = z.infer<typeof BlockerSchema>;

export const SourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
});
export type Source = z.infer<typeof SourceSchema>;

// One correction the verifier pass (lib/verifier.ts) made to a claim the
// generator drafted — e.g. downgraded evidence because the cited page
// didn't actually say what was claimed, or found a source for something
// that had none. Rendered as "What we changed after checking" in the UI
// so a correction is visible, not silently applied.
export const VerifierChangeSchema = z.object({
  field: z.string().min(1),
  before: z.string(),
  after: z.string(),
  reason: z.string().min(1),
});
export type VerifierChange = z.infer<typeof VerifierChangeSchema>;

export const GuideSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "slug must be lowercase kebab-case"),
  appName: z.string().min(1),
  website: z.string().url(),
  developerPortalUrl: z.string().url(),
  // False when the website/developerPortalUrl link above could not be
  // confirmed to belong to the resolved app's official domain (and a
  // confirmed fallback wasn't available either) — rendered as "unverified"
  // in the UI rather than presented as fact. Omitted (treated as verified)
  // on hand-checked library guides, where the URL was chosen by a human.
  websiteVerified: z.boolean().optional(),
  developerPortalVerified: z.boolean().optional(),
  // The specific API/product surface this guide covers (e.g. "Sign in
  // with Apple", not just "Apple") — a provider can have several that all
  // technically involve OAuth.
  surface: z.string().min(1),
  otherSurfaces: z.array(OtherSurfaceSchema),
  oauthFit: OAuthFitSchema,
  decision: DecisionSchema.optional(),
  difficulty: DifficultySchema,
  summary: z.string().min(1),
  setupTime: ValueWithEvidenceSchema,
  approval: ApprovalSchema,
  cost: CostSchema,
  rateLimits: ValueWithEvidenceSchema,
  prerequisites: z.array(PrerequisiteSchema),
  scopes: ScopesSchema,
  steps: z.array(StepSchema).min(1),
  blockers: z.array(BlockerSchema),
  agentCanDo: z.array(z.string()),
  humanMustDo: z.array(z.string()),
  // The last step every guide converges on: what exactly to hand Composio
  // (client ID/secret, redirect URI) to finish the integration.
  composioHandoff: z.string().min(1),
  openQuestions: z.array(z.string()),
  sources: z.array(SourceSchema),
  generatedBy: z.enum(["manual", "agent"]),
  lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "lastVerified must be an ISO date"),
  // Set once the verifier pass (lib/verifier.ts) has run over a generated
  // guide. Hand-checked library guides leave this unset — "verified by a
  // second AI pass" doesn't mean anything stronger than the hand-check
  // itself already means.
  verifiedBySecondPass: z.boolean().optional(),
  verifierChanges: z.array(VerifierChangeSchema).optional(),
  verifierUnverified: z.array(z.string()).optional(),
});
export type Guide = z.infer<typeof GuideSchema>;
