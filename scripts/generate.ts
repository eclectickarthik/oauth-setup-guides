// CLI: npm run generate -- <app>
//
// Runs the live-generation agent on any app name/website, even if a
// hand-checked guide for it already exists in data/guides/ — this never
// writes there. Output always goes to generated/<slug>.json so it can be
// reviewed (and fed to `npm run compare`) without risking the answer key.

import "./load-env";
import { promises as fs } from "fs";
import path from "path";
import { generateGuide, slugify } from "../lib/agent";
import { resolveApp } from "../lib/resolve";
import { verifyGuide } from "../lib/verifier";

const OUTPUT_DIR = path.join(process.cwd(), "generated");

async function main() {
  const rawInput = process.argv.slice(2).join(" ").trim();
  if (!rawInput) {
    console.error("Usage: npm run generate -- <app name or website>");
    process.exit(1);
  }

  console.log(`Resolving "${rawInput}"...`);
  const resolved = await resolveApp(rawInput, (message) => console.log(`  ${message}`));
  if (resolved.corrected_from) {
    console.log(`Resolved to "${resolved.canonical_name}" (${resolved.official_domain}).`);
  }
  if (resolved.confidence === "low") {
    console.log(
      `Note: low confidence on this resolution — proceeding anyway (this CLI has no ` +
        `interactive confirm step; the web UI does).`
    );
  }

  const slug = slugify(resolved.canonical_name);
  const handCheckedPath = path.join(process.cwd(), "data", "guides", `${slug}.json`);
  const handCheckedExists = await fs
    .access(handCheckedPath)
    .then(() => true)
    .catch(() => false);

  if (handCheckedExists) {
    console.log(
      `Note: a hand-checked guide already exists at data/guides/${slug}.json — ` +
        `this run will NOT touch it. Use "npm run compare -- ${resolved.canonical_name}" afterward.`
    );
  }

  console.log(`Generating guide for "${resolved.canonical_name}"...\n`);

  const drafted = await generateGuide(resolved, (message) => {
    console.log(`  ${message}`);
  });

  console.log(`\nVerifying "${drafted.appName}" against its sources...`);
  const { guide: verified, changes, unverified } = await verifyGuide(drafted, (message) => {
    console.log(`  ${message}`);
  });
  if (changes.length > 0) {
    console.log(`Verifier made ${changes.length} correction(s):`);
    for (const c of changes) console.log(`  - [${c.field}] ${c.reason}`);
  }
  const guide = { ...verified, verifierChanges: changes, verifierUnverified: unverified };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `${guide.slug}.json`);
  await fs.writeFile(outputPath, JSON.stringify(guide, null, 2), "utf-8");

  console.log(`\nSaved to ${path.relative(process.cwd(), outputPath)}`);
}

main().catch((err) => {
  console.error("\nGeneration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
