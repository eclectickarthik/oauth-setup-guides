import { promises as fs } from "fs";
import path from "path";
import type { Redis } from "@upstash/redis";
import { Guide } from "./schema";

const BLOB_PREFIX = "guides/";

// GuideStore holds *generated* guides (agent output), keyed by slug.
// Hand-checked library guides live separately in /data/guides/*.json and are
// read directly by the library page — they never go through this interface.

export interface GuideStore {
  get(slug: string): Promise<Guide | null>;
  set(slug: string, guide: Guide): Promise<void>;
  list(): Promise<Guide[]>;
}

// --- Local JSON-file implementation (dev fallback) -------------------------
// Stores each generated guide as its own file under /data/generated/<slug>.json.
// Not safe for concurrent writers in production — that's what the Redis
// implementation below is for.

const GENERATED_DIR = path.join(process.cwd(), "data", "generated");

async function ensureDir() {
  await fs.mkdir(GENERATED_DIR, { recursive: true });
}

function filePath(slug: string) {
  return path.join(GENERATED_DIR, `${slug}.json`);
}

export class LocalFileGuideStore implements GuideStore {
  async get(slug: string): Promise<Guide | null> {
    try {
      const raw = await fs.readFile(filePath(slug), "utf-8");
      return JSON.parse(raw) as Guide;
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") return null;
      throw err;
    }
  }

  async set(slug: string, guide: Guide): Promise<void> {
    await ensureDir();
    await fs.writeFile(filePath(slug), JSON.stringify(guide, null, 2), "utf-8");
  }

  async list(): Promise<Guide[]> {
    await ensureDir();
    const files = await fs.readdir(GENERATED_DIR);
    const guides = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => JSON.parse(await fs.readFile(path.join(GENERATED_DIR, f), "utf-8")) as Guide)
    );
    return guides;
  }
}

// --- Upstash Redis implementation (production) ------------------------------
// Lazily imports @upstash/redis so the local dev path never needs it installed.

export class UpstashGuideStore implements GuideStore {
  private clientPromise: Promise<Redis>;

  constructor(url: string, token: string) {
    this.clientPromise = import("@upstash/redis").then(
      ({ Redis }) => new Redis({ url, token })
    );
  }

  private key(slug: string) {
    return `guide:${slug}`;
  }

  async get(slug: string): Promise<Guide | null> {
    const client = await this.clientPromise;
    const data = await client.get(this.key(slug));
    return (data as Guide) ?? null;
  }

  async set(slug: string, guide: Guide): Promise<void> {
    const client = await this.clientPromise;
    await client.set(this.key(slug), guide);
    await client.sadd("guide:index", slug);
  }

  async list(): Promise<Guide[]> {
    const client = await this.clientPromise;
    const slugs: string[] = await client.smembers("guide:index");
    const guides = await Promise.all(slugs.map((slug) => this.get(slug)));
    return guides.filter((g): g is Guide => g !== null);
  }
}

// --- Vercel Blob implementation (production) --------------------------------
// Lazily imports @vercel/blob so the local dev path never needs it installed.
// Each guide is one JSON blob at guides/<slug>.json. The store itself is
// private-access (not publicly browsable by URL guessing); reads go through
// the SDK with the same read-write token used for writes, same as get()
// below does explicitly rather than relying on a bare fetch(blob.url).

export class BlobGuideStore implements GuideStore {
  constructor(private token: string) {}

  private pathname(slug: string) {
    return `${BLOB_PREFIX}${slug}.json`;
  }

  private async readStream(stream: ReadableStream<Uint8Array>): Promise<Guide> {
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf-8")) as Guide;
  }

  async get(slug: string): Promise<Guide | null> {
    const { get } = await import("@vercel/blob");
    const result = await get(this.pathname(slug), {
      access: "private",
      token: this.token,
    });
    if (!result || !result.stream) return null;
    return this.readStream(result.stream);
  }

  async set(slug: string, guide: Guide): Promise<void> {
    const { put } = await import("@vercel/blob");
    await put(this.pathname(slug), JSON.stringify(guide, null, 2), {
      access: "private",
      contentType: "application/json",
      token: this.token,
      allowOverwrite: true,
    });
  }

  async list(): Promise<Guide[]> {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: BLOB_PREFIX, token: this.token });
    const guides = await Promise.all(
      blobs.map((b) => this.get(b.pathname.slice(BLOB_PREFIX.length, -".json".length)))
    );
    return guides.filter((g): g is Guide => g !== null);
  }
}

// --- Factory -----------------------------------------------------------------
// Prefers Vercel Blob (BLOB_READ_WRITE_TOKEN), then Upstash Redis
// (UPSTASH_REDIS_REST_URL/TOKEN), otherwise local JSON files for dev.

let storeSingleton: GuideStore | null = null;

export function getGuideStore(): GuideStore {
  if (storeSingleton) return storeSingleton;

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  storeSingleton = blobToken
    ? new BlobGuideStore(blobToken)
    : url && token
      ? new UpstashGuideStore(url, token)
      : new LocalFileGuideStore();

  return storeSingleton;
}
