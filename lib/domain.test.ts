import { describe, expect, it } from "vitest";
import { isOfficialUrl, pickOfficialDocsUrl, registrableDomain } from "./domain";

describe("registrableDomain", () => {
  it("extracts the eTLD+1 from a URL", () => {
    expect(registrableDomain("https://docs.x.com/x-api/pricing")).toBe("x.com");
  });

  it("extracts the eTLD+1 from a bare domain", () => {
    expect(registrableDomain("reddit.com")).toBe("reddit.com");
  });
});

describe("isOfficialUrl", () => {
  it("rejects a third-party domain that merely contains the brand name", () => {
    // The exact bug: "reddit" appearing inside the domain string is not
    // the same as the registrable domain being reddit.com.
    expect(
      isOfficialUrl(
        "https://redditcommentscraper.com/article-reddit-pricing.html",
        "reddit.com"
      )
    ).toBe(false);
  });

  it("accepts the official domain itself", () => {
    expect(isOfficialUrl("https://reddit.com/some/path", "reddit.com")).toBe(true);
  });

  it("accepts a subdomain of the official domain", () => {
    expect(isOfficialUrl("https://www.reddit.com", "reddit.com")).toBe(true);
    expect(isOfficialUrl("https://docs.x.com/x-api/pricing", "x.com")).toBe(true);
  });

  it("returns false for an unparseable URL or domain", () => {
    expect(isOfficialUrl("not a url", "reddit.com")).toBe(false);
    expect(isOfficialUrl("https://reddit.com", "")).toBe(false);
  });
});

describe("pickOfficialDocsUrl", () => {
  const base = {
    website: "https://github.com",
    developerPortalUrl: "https://github.com/settings/developers",
  };

  it("picks an auth-related source on the official domain", () => {
    expect(
      pickOfficialDocsUrl({
        ...base,
        sources: [
          { title: "Rate limits", url: "https://docs.github.com/en/rest/rate-limits" },
          {
            title: "Authorizing OAuth apps",
            url: "https://docs.github.com/en/apps/oauth-apps/authorizing-oauth-apps",
          },
        ],
      })
    ).toBe("https://docs.github.com/en/apps/oauth-apps/authorizing-oauth-apps");
  });

  it("returns null when no official source is about auth", () => {
    expect(
      pickOfficialDocsUrl({
        ...base,
        sources: [{ title: "Rate limits", url: "https://docs.github.com/en/rest/rate-limits" }],
      })
    ).toBeNull();
  });

  it("ignores third-party sources and unverified domains", () => {
    expect(
      pickOfficialDocsUrl({
        ...base,
        sources: [{ title: "OAuth tutorial", url: "https://some-blog.dev/github-oauth" }],
      })
    ).toBeNull();
    expect(
      pickOfficialDocsUrl({
        website: "https://github-scraper.io",
        websiteVerified: false,
        developerPortalUrl: "https://github-scraper.io/dev",
        developerPortalVerified: false,
        sources: [{ title: "OAuth", url: "https://github-scraper.io/oauth" }],
      })
    ).toBeNull();
  });
});
