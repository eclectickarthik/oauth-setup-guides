import { notFound } from "next/navigation";
import { getLibraryGuide } from "@/lib/library";
import { getGuideStore } from "@/lib/store";
import CopyLinkButton from "@/components/CopyLinkButton";
import EvidenceBadge from "@/components/EvidenceBadge";
import type { Evidence } from "@/lib/schema";
import { pickOfficialDocsUrl } from "@/lib/domain";

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  hard: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  gated: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const OAUTH_FIT_STYLES: Record<string, string> = {
  standard_oauth: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  oauth_with_caveats: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  sign_in_only: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  no_oauth: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const OAUTH_FIT_LABEL: Record<string, string> = {
  standard_oauth: "Standard OAuth",
  oauth_with_caveats: "OAuth, with caveats",
  sign_in_only: "Sign-in only",
  no_oauth: "No OAuth",
};

const OWNER_LABEL: Record<string, string> = {
  human: "human",
  agent: "agent",
  both: "human → agent",
};

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      {children}
    </div>
  );
}

function EvidenceLegend() {
  const items: { level: string; label: string }[] = [
    { level: "hand_checked", label: "hand-checked" },
    { level: "doc_sourced", label: "doc-sourced" },
    { level: "inferred", label: "inferred" },
    { level: "uncertain", label: "uncertain" },
  ];
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-500">
      <span className="font-medium">Evidence:</span>
      {items.map((item) => (
        <span key={item.level} className="flex items-center gap-1.5">
          <EvidenceBadge evidence={{ level: item.level, sourceUrl: null, note: null } as Evidence} />
        </span>
      ))}
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

  const docsUrl = pickOfficialDocsUrl(guide);
  const wasCorrected = from && from.trim().toLowerCase() !== guide.appName.toLowerCase();

  // "manual" means a human wrote the file, not that every claim was
  // hands-on verified — several library guides are manually authored but
  // entirely docs-researched (evidence: doc_sourced), never actually
  // tested against the provider's real UI. Only claim "Hand-checked" when
  // at least one claim in the guide is marked hand_checked.
  const hasHandCheckedEvidence = [
    ...guide.steps,
    ...guide.prerequisites,
    ...guide.blockers,
  ].some((claim) => claim.evidence.level === "hand_checked");
  const provenanceLabel =
    guide.generatedBy === "manual"
      ? hasHandCheckedEvidence
        ? `Hand-checked · last verified ${guide.lastVerified}`
        : `Docs-researched, not hands-on tested · last verified ${guide.lastVerified}`
      : `Agent-generated · generated on ${guide.lastVerified}${guide.verifiedBySecondPass ? " · verified by second pass" : ""}`;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-3xl px-6 py-16">
        {guide.oauthFit.value === "no_oauth" && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-200">
            <span className="mt-0.5 shrink-0">⚠️</span>
            <p>
              <span className="font-medium">No user-delegated OAuth here.</span>{" "}
              {guide.oauthFit.reason}
            </p>
          </div>
        )}

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
                {guide.appName}
              </h1>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${DIFFICULTY_STYLES[guide.difficulty]}`}
              >
                {guide.difficulty}
              </span>
              <details className="group relative">
                <summary
                  className={`cursor-pointer list-none rounded-full px-2 py-0.5 text-xs font-medium ${OAUTH_FIT_STYLES[guide.oauthFit.value]}`}
                >
                  {OAUTH_FIT_LABEL[guide.oauthFit.value]}
                </summary>
                <p className="absolute left-0 top-full z-10 mt-1 w-64 rounded-md border border-zinc-200 bg-white p-2 text-xs font-normal text-zinc-700 shadow-md dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                  {guide.oauthFit.reason}
                </p>
              </details>
            </div>
            {guide.surface !== guide.appName && (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
                Surface: {guide.surface}
              </p>
            )}
            {wasCorrected && (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
                Showing results for {guide.appName} (you typed &quot;{from}&quot;)
              </p>
            )}
            <p className="mt-2 max-w-xl text-zinc-600 dark:text-zinc-400">
              {guide.summary}
            </p>
            {guide.otherSurfaces.length > 0 && (
              <p className="mt-2 max-w-xl text-sm text-zinc-500 dark:text-zinc-500">
                <span className="font-medium text-zinc-600 dark:text-zinc-400">
                  Also considered:{" "}
                </span>
                {guide.otherSurfaces.map((s, i) => (
                  <span key={i}>
                    {i > 0 && "; "}
                    {s.name} ({s.whyNot})
                  </span>
                ))}
              </p>
            )}
          </div>
          <CopyLinkButton />
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-sm text-zinc-600 dark:text-zinc-400">
          <a
            href={guide.website}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-black dark:hover:text-zinc-50"
          >
            Website
          </a>
          {guide.websiteVerified === false && (
            <span className="text-zinc-400 dark:text-zinc-600">(unverified)</span>
          )}
          {docsUrl ? (
            <a
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-black dark:hover:text-zinc-50"
            >
              Docs
            </a>
          ) : (
            <span
              title="No official OAuth docs page among this guide's sources"
              className="cursor-not-allowed text-zinc-400 dark:text-zinc-600"
            >
              Docs unavailable
            </span>
          )}
          <a
            href={guide.developerPortalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-black dark:hover:text-zinc-50"
          >
            Developer portal
          </a>
          {guide.developerPortalVerified === false && (
            <span className="text-zinc-400 dark:text-zinc-600">(unverified)</span>
          )}
        </div>

        <EvidenceLegend />

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <Card>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase text-zinc-500">Hands-on setup time</p>
              <EvidenceBadge evidence={guide.setupTime.evidence} />
            </div>
            <p className="mt-1 font-medium text-black dark:text-zinc-50">
              {guide.setupTime.value}
            </p>
          </Card>
          <Card>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase text-zinc-500">Rate limits</p>
              <EvidenceBadge evidence={guide.rateLimits.evidence} />
            </div>
            <p className="mt-1 font-medium text-black dark:text-zinc-50">
              {guide.rateLimits.value}
            </p>
          </Card>
          <Card>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase text-zinc-500">API access cost</p>
              <EvidenceBadge evidence={guide.cost.evidence} />
            </div>
            <p className="mt-1 font-medium text-black dark:text-zinc-50">{guide.cost.value}</p>
            {guide.cost.notes && (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{guide.cost.notes}</p>
            )}
          </Card>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Approval</h2>
          <ul className="mt-3 space-y-2">
            {guide.approval.paths.map((path, i) => (
              <li
                key={i}
                className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-black dark:text-zinc-50">{path.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase text-zinc-500">
                      {path.reviewRequired ? "review required" : "no review"}
                    </span>
                    <EvidenceBadge evidence={path.evidence} />
                  </div>
                </div>
                <p className="mt-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {path.wait}
                </p>
                {path.notes && (
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{path.notes}</p>
                )}
              </li>
            ))}
          </ul>
        </section>

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

        <section className="mt-8">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Scopes</h2>
            <EvidenceBadge evidence={guide.scopes.evidence} />
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-zinc-500">Minimum for a typical agent</p>
              <ul className="mt-2 space-y-1 text-sm">
                {guide.scopes.minimum.map((s, i) => (
                  <li key={i}>
                    <code className="rounded bg-zinc-200 px-1 py-0.5 text-xs dark:bg-zinc-800">
                      {s.scope}
                    </code>{" "}
                    <span className="text-zinc-600 dark:text-zinc-400">{s.why}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase text-zinc-500">Optional / advanced</p>
              <ul className="mt-2 space-y-1 text-sm">
                {guide.scopes.optional.map((s, i) => (
                  <li key={i}>
                    <code className="rounded bg-zinc-200 px-1 py-0.5 text-xs dark:bg-zinc-800">
                      {s.scope}
                    </code>{" "}
                    <span className="text-zinc-600 dark:text-zinc-400">{s.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {guide.scopes.modes.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
              {guide.scopes.modes.map((m, i) => (
                <li key={i}>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{m.name}: </span>
                  {m.whenToUse}
                </li>
              ))}
            </ul>
          )}
        </section>

        {guide.prerequisites.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Before you start
            </h2>
            <ul className="mt-3 space-y-2">
              {guide.prerequisites.map((claim, i) => (
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
                    <span className="text-xs uppercase text-zinc-500">
                      {OWNER_LABEL[step.owner]}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {step.description}
                </p>
                {step.agentAssist && (
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
                    <span className="font-medium text-zinc-600 dark:text-zinc-400">
                      Agent can help:{" "}
                    </span>
                    {step.agentAssist}
                  </p>
                )}
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

        <section className="mt-8 rounded-lg border border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xs uppercase text-zinc-500">Composio handoff</p>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            {guide.composioHandoff}
          </p>
        </section>

        {guide.sources.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Sources</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {guide.sources.map((s, i) => (
                <li key={i}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-600 underline hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {guide.verifierChanges && guide.verifierChanges.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              What we changed after checking
            </h2>
            <ul className="mt-3 space-y-2">
              {guide.verifierChanges.map((change, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <p className="font-medium text-black dark:text-zinc-50">{change.field}</p>
                  <p className="mt-1 text-zinc-500 dark:text-zinc-500 line-through">
                    {change.before}
                  </p>
                  <p className="mt-1 text-zinc-700 dark:text-zinc-300">{change.after}</p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">{change.reason}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

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

        {guide.verifierUnverified && guide.verifierUnverified.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Still unverified
            </h2>
            <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
              {guide.verifierUnverified.map((item, i) => (
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
