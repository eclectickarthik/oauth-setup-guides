// Parses the fixed markdown shape scripts/compare.ts's renderMarkdown()
// produces — not a general markdown parser. Kept in sync with that function;
// if its output shape changes, this needs to change too.

export type ComparisonClaim = { section: string; text: string; reason: string };
export type ComparisonSection = { title: string; claims: ComparisonClaim[] };
export type ParsedComparison = {
  appName: string;
  summary: string;
  sections: ComparisonSection[];
  missed: { section: string; text: string }[];
};

export function parseComparisonMarkdown(markdown: string): ParsedComparison {
  const lines = markdown.split("\n");
  let i = 0;

  const titleLine = lines[i++] ?? "";
  const appName = titleLine.replace(/^#\s*Comparison:\s*/, "").trim();

  while (lines[i] === "") i++;
  const summaryLines: string[] = [];
  while (i < lines.length && !lines[i].startsWith("## ")) {
    if (lines[i] !== "") summaryLines.push(lines[i]);
    i++;
  }
  const summary = summaryLines.join(" ").trim();

  const sections: ComparisonSection[] = [];
  const missed: { section: string; text: string }[] = [];

  while (i < lines.length) {
    const heading = lines[i];
    if (!heading.startsWith("## ")) {
      i++;
      continue;
    }
    const isMissed = heading.startsWith("## Missed from the hand-checked guide");
    const title = heading
      .replace(/^##\s*/, "")
      .replace(/\s*\(\d+\)\s*$/, "")
      .trim();
    i++;
    while (lines[i] === "") i++;

    const claims: ComparisonClaim[] = [];
    while (i < lines.length && !lines[i].startsWith("## ")) {
      const bulletMatch = lines[i].match(/^- \*\*\[([^\]]+)\]\*\*\s*(.*)$/);
      if (bulletMatch) {
        const [, section, text] = bulletMatch;
        let reason = "";
        if (lines[i + 1]?.trimStart().startsWith("- ")) {
          reason = lines[i + 1].trim().replace(/^-\s*/, "");
          i++;
        }
        if (isMissed) {
          missed.push({ section, text });
        } else {
          claims.push({ section, text, reason });
        }
      }
      i++;
    }
    if (!isMissed) sections.push({ title, claims });
  }

  return { appName, summary, sections, missed };
}
