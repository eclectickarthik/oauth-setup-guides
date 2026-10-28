// Next.js auto-loads .env/.env.local; standalone tsx scripts don't. Mirror
// the same precedence (.env first, .env.local overrides) using Node's
// built-in loader. Import this before anything that reads process.env.

import { existsSync } from "fs";

for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
