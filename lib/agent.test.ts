import { describe, expect, it } from "vitest";
import { enforceOfficialLinks, scoreResult } from "./agent";
import type { Guide } from "./schema";
import type { ResolvedApp } from "./resolve";

function baseGuide(overrides: Partial<Guide> = {}): Guide {
  return {
    slug: "reddit",
    appName: "Reddit",
    website: "https://reddit.com",
    developerPortalUrl: "https://www.reddit.com/dev/api",
    summary: "Set up a Reddit OAuth app.",
    difficulty: "easy",
    difficultyReason: "Instant app creation, no review for personal use.",
    time: { setup: "15 min", approvalWait: "None for personal use" },
    accessCost: {
      tier: "free",
      pricingModel: "free",
      rates: "free for standard use",
      freeTierLimits: "generous for personal use",
      sources: ["https://reddit.com/dev/api"],
    },
    whenReviewIsNeeded: [],
    requirements: [],
    steps: [
      {
        title: "Create an app",
        detail: "Register an app in Reddit's developer settings.",
        actor: "human",
        evidence: "docs",
        sources: ["https://reddit.com/prefs/apps"],
      },
    ],
    blockers: [],
    agentCanDo: [],
    humanMustDo: [],
    openQuestions: [],
    generatedBy: "agent",
    lastVerified: "2026-10-28",
    ...overrides,
  };
}

const resolvedReddit: ResolvedApp = {
  canonical_name: "Reddit",
  official_domain: "reddit.com",
  developer_portal_url: null,
  confidence: "high",
  corrected_from: "reddddit",
};

describe("enforceOfficialLinks", () => {
  it("rejects a third-party scraper site and falls back to the official domain", () => {
    // The exact bug: drafting picked up a site whose domain merely
    // contains the brand name, not the company's own domain.
    const drafted = baseGuide({
      website: "https://redditcommentscraper.com/article-reddit-pricing.html",
    });

    const result = enforceOfficialLinks(drafted, resolvedReddit);

    expect(result.website).toBe("https://reddit.com");
    expect(result.websiteVerified).toBe(true);
  });

  it("keeps a website that is already on the official domain", () => {
    const drafted = baseGuide({ website: "https://www.reddit.com/some/path" });

    const result = enforceOfficialLinks(drafted, resolvedReddit);

    expect(result.website).toBe("https://www.reddit.com/some/path");
    expect(result.websiteVerified).toBe(true);
  });

  it("keeps a developer portal URL on the resolved developer portal's domain", () => {
    const resolved: ResolvedApp = {
      ...resolvedReddit,
      developer_portal_url: "https://developers.reddit.com",
    };
    const drafted = baseGuide({
      developerPortalUrl: "https://developers.reddit.com/docs/oauth",
    });

    const result = enforceOfficialLinks(drafted, resolved);

    expect(result.developerPortalUrl).toBe("https://developers.reddit.com/docs/oauth");
    expect(result.developerPortalVerified).toBe(true);
  });

  it("marks the field unverified when no official domain can be confirmed at all", () => {
    const resolved: ResolvedApp = {
      canonical_name: "Reddit",
      official_domain: "",
      developer_portal_url: null,
      confidence: "low",
      corrected_from: null,
    };
    const drafted = baseGuide({
      website: "https://redditcommentscraper.com/article-reddit-pricing.html",
    });

    const result = enforceOfficialLinks(drafted, resolved);

    expect(result.websiteVerified).toBe(false);
  });
});

describe("scoreResult", () => {
  // JUNK_DOMAINS exists to deprioritize discussion/review sites for most
  // apps (a reddit.com thread about some other app's API is noise), but
  // reddit.com, x.com, linkedin.com and facebook.com are themselves real
  // companies — the exact bug: researching Reddit itself penalized
  // Reddit's own pages while giving an unrelated blog no penalty at all,
  // so the blog outranked Reddit's own docs.
  it("ranks the official domain above an unrelated blog, even when the official domain is also in JUNK_DOMAINS", () => {
    const officialDomains = ["reddit.com"];

    const officialScore = scoreResult(
      { url: "https://www.reddit.com/prefs/apps" },
      "reddit",
      officialDomains
    );
    const blogScore = scoreResult(
      { url: "https://octolens.com/blog/reddit-api-pricing" },
      "reddit",
      officialDomains
    );

    expect(officialScore).toBeGreaterThan(blogScore);
  });

  it("still deprioritizes a third-party domain when researching an unrelated app", () => {
    const officialDomains = ["notion.so"];

    const redditDiscussion = scoreResult(
      { url: "https://www.reddit.com/r/notion/comments/xyz" },
      "notion",
      officialDomains
    );
    const docsPage = scoreResult(
      { url: "https://developers.notion.com/docs/authorization" },
      "notion",
      officialDomains
    );

    expect(docsPage).toBeGreaterThan(redditDiscussion);
  });
});
