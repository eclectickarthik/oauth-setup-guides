import { notFound } from "next/navigation";
import { getLibraryGuide } from "@/lib/library";
import { getGuideStore } from "@/lib/store";
import CopyLinkButton from "@/components/CopyLinkButton";
import EvidenceBadge from "@/components/EvidenceBadge";

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  hard: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  gated: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const ACCESS_COST_STYLES: Record<string, string> = {
  free: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  freemium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  paid: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      {children}
    </div>
  );
}

export default async function GuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { slug } = await params;
  const { from } = await searchParams;

  const guide =
    (await getLibraryGuide(slug)) ?? (await getGuideStore().get(slug));

  if (!guide) notFound();

  const wasCorrected = from && from.trim().toLowerCase() !== guide.appName.toLowerCase();

  // "manual" means a human wrote the file, not that every claim was
  // hands-on verified — several library guides are manually authored but
  // entirely docs-researched (evidence: "docs"), never actually tested
  // against the provider's real UI. Only claim "Hand-checked" when at
  // least one claim in the guide is marked "tested".
  const hasTestedEvidence = [
    ...guide.steps,
    ...guide.requirements,
    ...guide.blockers,
  ].some((claim) => claim.evidence === "tested");
  const provenanceLabel =
    guide.generatedBy === "manual"
      ? hasTestedEvidence
        ? `Hand-checked · last verified ${guide.lastVerified}`
        : `Docs-researched, not hands-on tested · last verified ${guide.lastVerified}`
      : `Agent-generated · generated on ${guide.lastVerified}`;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-3xl px-6 py-16">
        {guide.warning && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200">
            <span className="mt-0.5 shrink-0">⚠️</span>
            <p>{guide.warning}</p>
          </div>
        )}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
                {guide.appName}
              </h1>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${DIFFICULTY_STYLES[guide.difficulty]}`}
              >
                {guide.difficulty}
              </span>
            </div>
            {wasCorrected && (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
                Showing results for {guide.appName} (you typed &quot;{from}&quot;)
              </p>
            )}
            <p className="mt-2 max-w-xl text-zinc-600 dark:text-zinc-400">
              {guide.summary}
            </p>
          </div>
          <CopyLinkButton />
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-sm text-zinc-600 dark:text-zinc-400">
          <a href={guide.website} className="underline hover:text-black dark:hover:text-zinc-50">
            Website
          </a>
          {guide.websiteVerified === false && (
            <span className="text-zinc-400 dark:text-zinc-600">(unverified)</span>
          )}
          <a
            href={guide.developerPortalUrl}
            className="underline hover:text-black dark:hover:text-zinc-50"
          >
            Developer portal
          </a>
          {guide.developerPortalVerified === false && (
            <span className="text-zinc-400 dark:text-zinc-600">(unverified)</span>
          )}
        </div>

        <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">{guide.difficultyReason}</p>

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-xs uppercase text-zinc-500">Hands-on setup time</p>
            <p className="mt-1 font-medium text-black dark:text-zinc-50">{guide.time.setup}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase text-zinc-500">Approval / review wait</p>
            <p className="mt-1 font-medium text-black dark:text-zinc-50">
              {guide.time.approvalWait}
            </p>
          </Card>
          <Card>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase text-zinc-500">API access cost</p>
              {guide.accessCost && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ACCESS_COST_STYLES[guide.accessCost.tier]}`}
                >
                  {guide.accessCost.tier}
                </span>
              )}
            </div>
            {guide.accessCost ? (
              <>
                <p className="mt-1 font-medium text-black dark:text-zinc-50">
                  {guide.accessCost.pricingModel}
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {guide.accessCost.rates}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">Not recorded.</p>
            )}
          </Card>
        </section>
        {guide.time.notes && (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">{guide.time.notes}</p>
        )}
        {guide.accessCost && (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
            <span className="font-medium text-zinc-600 dark:text-zinc-400">Free-tier limits: </span>
            {guide.accessCost.freeTierLimits}
            {guide.accessCost.sources[0] && (
              <>
                {" — "}
                <a
                  href={guide.accessCost.sources[0]}
                  className="underline hover:text-black dark:hover:text-zinc-50"
                >
                  source
                </a>
              </>
            )}
          </p>
        )}

        {guide.decision && (
          <section className="mt-8 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              {guide.decision.question}
            </h2>
            <div className="mt-3 space-y-3">
              {guide.decision.options.map((option, i) => (
                <div key={i}>
                  <p className="font-medium text-black dark:text-zinc-50">
                    {option.name}
                  </p>
                  <ul className="mt-1 list-inside list-disc text-sm text-zinc-600 dark:text-zinc-400">
                    {option.pickWhen.map((reason, j) => (
                      <li key={j}>{reason}</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-sm italic text-zinc-500 dark:text-zinc-500">
                    {option.tradeoff}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
              <span className="font-medium">Recommendation: </span>
              {guide.decision.recommendation}
            </p>
          </section>
        )}

        {guide.requirements.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Before you start
            </h2>
            <ul className="mt-3 space-y-2">
              {guide.requirements.map((claim, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <EvidenceBadge evidence={claim.evidence} sources={claim.sources} />
                  <span className="text-zinc-700 dark:text-zinc-300">{claim.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {guide.whenReviewIsNeeded.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              When review is needed
            </h2>
            <ul className="mt-3 space-y-2">
              {guide.whenReviewIsNeeded.map((claim, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <EvidenceBadge evidence={claim.evidence} sources={claim.sources} />
                  <span className="text-zinc-700 dark:text-zinc-300">{claim.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
            Setup steps
          </h2>
          <ol className="mt-3 space-y-3">
            {guide.steps.map((step, i) => (
              <li
                key={i}
                className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-black dark:text-zinc-50">
                    {step.title}
                  </span>
                  <div className="flex items-center gap-2">
                    <EvidenceBadge evidence={step.evidence} sources={step.sources} />
                    <span className="text-xs uppercase text-zinc-500">{step.actor}</span>
                  </div>
                </div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {step.detail}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {guide.blockers.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Common blockers
            </h2>
            <ul className="mt-3 space-y-3">
              {guide.blockers.map((blocker, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-black dark:text-zinc-50">
                      {blocker.problem}
                    </span>
                    <EvidenceBadge evidence={blocker.evidence} sources={blocker.sources} />
                  </div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {blocker.fix}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <Card>
            <p className="text-xs uppercase text-zinc-500">An agent can do</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
              {guide.agentCanDo.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </Card>
          <Card>
            <p className="text-xs uppercase text-zinc-500">A human must do</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
              {guide.humanMustDo.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </Card>
        </section>

        {guide.openQuestions.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Open questions
            </h2>
            <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
              {guide.openQuestions.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-10 text-xs text-zinc-400 dark:text-zinc-600">
          {provenanceLabel}
        </p>
      </main>
    </div>
  );
}
