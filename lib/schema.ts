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

export const GuideSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "slug must be lowercase kebab-case"),
  appName: z.string().min(1),
  website: z.string().url(),
  developerPortalUrl: z.string().url(),
  summary: z.string().min(1),
  difficulty: DifficultySchema,
  difficultyReason: z.string().min(1),
  time: z.object({
    setup: z.string().min(1),
    approvalWait: z.string().min(1),
    notes: z.string().optional(),
  }),
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
