import { z } from "zod";

// Guide schema — single source of truth for the shape of an OAuth setup guide.
// Both library guides (/data/guides/*.json) and agent-generated guides are
// validated against this before they're stored or rendered.

export const EvidenceSchema = z.enum(["tested", "docs", "uncertain"]);
export type Evidence = z.infer<typeof EvidenceSchema>;

// Sources are required unless evidence is "tested" (first-hand, no URL to cite).
const withSourceRule = <T extends z.ZodObject<{ evidence: typeof EvidenceSchema; sources: z.ZodArray<z.ZodString> }>>(
  schema: T
) =>
  schema.refine(
    (val) => val.evidence === "tested" || val.sources.length > 0,
    { message: "sources are required unless evidence is 'tested'", path: ["sources"] }
  );

export const ClaimSchema = withSourceRule(
  z.object({
    text: z.string().min(1),
    evidence: EvidenceSchema,
    sources: z.array(z.string().url()),
  })
);
export type Claim = z.infer<typeof ClaimSchema>;

export const StepSchema = withSourceRule(
  z.object({
    title: z.string().min(1),
    detail: z.string().min(1),
    actor: z.enum(["agent", "human"]),
    evidence: EvidenceSchema,
    sources: z.array(z.string().url()),
  })
);
export type Step = z.infer<typeof StepSchema>;

export const BlockerSchema = withSourceRule(
  z.object({
    problem: z.string().min(1),
    fix: z.string().min(1),
    evidence: EvidenceSchema,
    sources: z.array(z.string().url()),
  })
);
export type Blocker = z.infer<typeof BlockerSchema>;

export const DifficultySchema = z.enum(["easy", "medium", "hard", "gated"]);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const DecisionSchema = z.object({
  question: z.string().min(1),
  options: z.array(
    z.object({
      name: z.string().min(1),
      pickWhen: z.array(z.string().min(1)),
      tradeoff: z.string().min(1),
    })
  ).min(1),
  recommendation: z.string().min(1),
});
export type Decision = z.infer<typeof DecisionSchema>;

// Separate from setup time and approval wait on purpose: a developer can
// clear both of those in 30 minutes and still be unable to ship anything,
// because API usage itself costs money or has no free tier. Required (not
// optional) because skipping this is exactly how a guide ends up saying
// keys are available "immediately" while leaving pricing as an open
// question — see docs/validation.md's X/Twitter entry.
export const AccessCostTierSchema = z.enum(["free", "freemium", "paid"]);
export type AccessCostTier = z.infer<typeof AccessCostTierSchema>;

export const AccessCostSchema = z.object({
  tier: AccessCostTierSchema,
  pricingModel: z.string().min(1), // e.g. "pay-per-use", "flat monthly fee", "free"
  rates: z.string().min(1), // rough rates, e.g. "$0.01 per post created, $0.005 per post read"
  freeTierLimits: z.string().min(1), // free-tier limits/exceptions, or "none" if genuinely none
  sources: z.array(z.string().url()).min(1),
});
export type AccessCost = z.infer<typeof AccessCostSchema>;

export const GuideSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "slug must be lowercase kebab-case"),
  appName: z.string().min(1),
  website: z.string().url(),
  developerPortalUrl: z.string().url(),
  summary: z.string().min(1),
  // Set when the researched API doesn't actually offer a user-delegated
  // (authorization_code) OAuth flow — e.g. it only supports client_credentials,
  // server-to-server access to the developer's own account, with no end-user
  // consent step at all. Rendered as a prominent banner instead of being
  // silently presented as a normal setup guide.
  warning: z.string().min(1).optional(),
  decision: DecisionSchema.optional(),
  difficulty: DifficultySchema,
  difficultyReason: z.string().min(1),
  time: z.object({
    setup: z.string().min(1),
    approvalWait: z.string().min(1),
    notes: z.string().optional(),
  }),
  accessCost: AccessCostSchema,
  whenReviewIsNeeded: z.array(ClaimSchema),
  requirements: z.array(ClaimSchema),
  steps: z.array(StepSchema).min(1),
  blockers: z.array(BlockerSchema),
  agentCanDo: z.array(z.string()),
  humanMustDo: z.array(z.string()),
  openQuestions: z.array(z.string()),
  generatedBy: z.enum(["manual", "agent"]),
  lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "lastVerified must be an ISO date"),
});
export type Guide = z.infer<typeof GuideSchema>;
