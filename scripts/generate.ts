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

const OUTPUT_DIR = path.join(process.cwd(), "generated");

async function main() {
  const appInput = process.argv.slice(2).join(" ").trim();
  if (!appInput) {
    console.error("Usage: npm run generate -- <app name or website>");
    process.exit(1);
  }

  const slug = slugify(appInput);
  const handCheckedPath = path.join(process.cwd(), "data", "guides", `${slug}.json`);
  const handCheckedExists = await fs
    .access(handCheckedPath)
    .then(() => true)
    .catch(() => false);

  if (handCheckedExists) {
    console.log(
      `Note: a hand-checked guide already exists at data/guides/${slug}.json — ` +
        `this run will NOT touch it. Use "npm run compare -- ${appInput}" afterward.`
    );
  }

  console.log(`Generating guide for "${appInput}"...\n`);

  const guide = await generateGuide(appInput, (message) => {
    console.log(`  ${message}`);
  });

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `${guide.slug}.json`);
  await fs.writeFile(outputPath, JSON.stringify(guide, null, 2), "utf-8");

  console.log(`\nSaved to ${path.relative(process.cwd(), outputPath)}`);
}

main().catch((err) => {
  console.error("\nGeneration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
