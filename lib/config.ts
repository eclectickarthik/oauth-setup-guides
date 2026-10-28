// Shared config used by lib/agent.ts and lib/resolve.ts. Lives in its own
// file so resolve.ts (which agent.ts now depends on) doesn't need to
// import from agent.ts — avoids a circular import.

export const MODEL = process.env.LLM_MODEL || "gemini-3.5-flash-lite";
