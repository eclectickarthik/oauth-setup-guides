import { parse } from "tldts";

// Registrable domain = eTLD+1 (e.g. "redditcommentscraper.com" from
// "https://redditcommentscraper.com/article-reddit-...", not "reddit"
// even though "reddit" appears inside it). This is the whole point: a
// brand name appearing inside a domain string is not the same as owning
// that domain.
export function registrableDomain(urlOrDomain: string): string | null {
  const withScheme = urlOrDomain.includes("://") ? urlOrDomain : `https://${urlOrDomain}`;
  try {
    return parse(withScheme).domain ?? null;
  } catch {
    return null;
  }
}

export function isOfficialUrl(url: string, officialDomain: string): boolean {
  const urlDomain = registrableDomain(url);
  const official = registrableDomain(officialDomain);
  if (!urlDomain || !official) return false;
  return urlDomain === official;
}
