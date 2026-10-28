// Shared with lib/resolve.ts — see lib/config.ts for why this is split out.

export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}
