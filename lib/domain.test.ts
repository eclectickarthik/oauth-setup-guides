import { describe, expect, it } from "vitest";
import { isOfficialUrl, registrableDomain } from "./domain";

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
