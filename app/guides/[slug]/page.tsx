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

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      {children}
    </div>
  );
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const guide =
    (await getLibraryGuide(slug)) ?? (await getGuideStore().get(slug));

  if (!guide) notFound();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-3xl px-6 py-16">
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
          <a
            href={guide.developerPortalUrl}
            className="underline hover:text-black dark:hover:text-zinc-50"
          >
            Developer portal
          </a>
        </div>

        <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">{guide.difficultyReason}</p>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
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
        </section>
        {guide.time.notes && (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">{guide.time.notes}</p>
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
                  <EvidenceBadge evidence={claim.evidence} />
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
                  <EvidenceBadge evidence={claim.evidence} />
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
                    <EvidenceBadge evidence={step.evidence} />
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
                    <EvidenceBadge evidence={blocker.evidence} />
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
          {guide.generatedBy === "manual" ? "Hand-checked" : "Agent-generated"} · last
          verified {guide.lastVerified}
        </p>
      </main>
    </div>
  );
}
