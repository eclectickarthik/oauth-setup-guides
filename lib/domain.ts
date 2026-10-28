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

// Picks the guide's "Docs" header link: a source the guide actually cites
// that sits on the provider's own domain and is about OAuth/auth setup.
// Returns null rather than falling back to any official page, so the
// header shows "Docs unavailable" instead of labelling, say, a rate-limits
// page as the docs. Only trusts the website/portal domains that weren't
// flagged unverified.
const AUTH_DOC_PATTERN = /oauth|auth|scope|consent|credential/i;

export function pickOfficialDocsUrl(guide: {
  website: string;
  websiteVerified?: boolean;
  developerPortalUrl: string;
  developerPortalVerified?: boolean;
  sources: { title: string; url: string }[];
}): string | null {
  const officialDomains = [
    guide.websiteVerified !== false ? guide.website : null,
    guide.developerPortalVerified !== false ? guide.developerPortalUrl : null,
  ].filter((d): d is string => d !== null);

  const match = guide.sources.find(
    (s) =>
      officialDomains.some((d) => isOfficialUrl(s.url, d)) &&
      AUTH_DOC_PATTERN.test(`${s.title} ${s.url}`)
  );
  return match?.url ?? null;
}
