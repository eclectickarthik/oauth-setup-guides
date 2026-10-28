import { promises as fs } from "fs";
import path from "path";
import { Guide, GuideSchema } from "./schema";

// Reads the hand-checked library guides from /data/guides/*.json.
// These are curated (generatedBy: "manual") and validated the same way
// agent-generated guides are, so a bad hand edit fails loudly in dev.

const LIBRARY_DIR = path.join(process.cwd(), "data", "guides");

export async function getLibraryGuides(): Promise<Guide[]> {
  const files = await fs.readdir(LIBRARY_DIR);
  const guides = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        const raw = await fs.readFile(path.join(LIBRARY_DIR, f), "utf-8");
        const parsed = GuideSchema.parse(JSON.parse(raw));
        return parsed;
      })
  );
  return guides;
}

export async function getLibraryGuide(slug: string): Promise<Guide | null> {
  const guides = await getLibraryGuides();
  return guides.find((g) => g.slug === slug) ?? null;
}
