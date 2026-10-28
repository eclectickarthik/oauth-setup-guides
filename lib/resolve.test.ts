import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Gemini client so these tests are free, fast, and don't depend
// on a live API key. Each test controls exactly what the "model" returns.
const mockCreate = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: function MockGoogleGenAI() {
    return { interactions: { create: mockCreate } };
  },
}));

const mockTavilySearch = vi.fn();
vi.mock("./tavily", () => ({
  tavilySearch: (...args: unknown[]) => mockTavilySearch(...args),
}));

import { needsConfirmation, resolveApp, type ResolvedApp } from "./resolve";

function queueGeminiResponse(json: Record<string, unknown>) {
  mockCreate.mockResolvedValueOnce({ output_text: JSON.stringify(json) });
}

beforeEach(() => {
  mockCreate.mockReset();
  mockTavilySearch.mockReset();
  mockTavilySearch.mockResolvedValue([]);
  process.env.GEMINI_API_KEY = "test-key";
});

describe("resolveApp", () => {
  it('resolves a misspelled input ("reddddit") to the real product', async () => {
    queueGeminiResponse({
      canonical_name: "Reddit",
      official_domain: "reddit.com",
      confidence: "high",
    });

    const result = await resolveApp("reddddit");

    expect(result.canonical_name).toBe("Reddit");
    expect(result.official_domain).toBe("reddit.com");
    expect(result.confidence).toBe("high");
    expect(result.corrected_from).toBe("reddddit");
  });

  it("leaves a correctly spelled app unchanged (no correction)", async () => {
    queueGeminiResponse({
      canonical_name: "Slack",
      official_domain: "slack.com",
      confidence: "high",
    });

    const result = await resolveApp("Slack");

    expect(result.canonical_name).toBe("Slack");
    expect(result.corrected_from).toBeNull();
  });

  it("returns low confidence for an ambiguous input and triggers the search fallback", async () => {
    queueGeminiResponse({
      canonical_name: "Ambiguous App",
      official_domain: "",
      confidence: "low",
    });
    mockTavilySearch.mockResolvedValueOnce([
      { title: "Ambiguous App — official site", url: "https://ambiguousapp.example.com", content: "..." },
    ]);
    queueGeminiResponse({
      canonical_name: "Ambiguous App",
      official_domain: "ambiguousapp.example.com",
      confidence: "low",
    });

    const result = await resolveApp("ambiguous-app-xyz");

    expect(result.confidence).toBe("low");
    expect(mockTavilySearch).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(2); // initial ask + re-ask with search context
  });

  it("does not search again when the initial resolution is already confident", async () => {
    queueGeminiResponse({
      canonical_name: "GitHub",
      official_domain: "github.com",
      confidence: "high",
    });

    await resolveApp("github");

    expect(mockTavilySearch).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe("needsConfirmation", () => {
  function resolvedWith(confidence: ResolvedApp["confidence"]): ResolvedApp {
    return {
      canonical_name: "Ambiguous App",
      official_domain: "ambiguousapp.example.com",
      developer_portal_url: null,
      confidence,
      corrected_from: null,
    };
  }

  it("triggers the confirm step for a low-confidence, unconfirmed result", () => {
    expect(needsConfirmation(resolvedWith("low"), false)).toBe(true);
  });

  it("does not trigger confirmation once the client has confirmed", () => {
    expect(needsConfirmation(resolvedWith("low"), true)).toBe(false);
  });

  it("does not trigger confirmation for a high-confidence result", () => {
    expect(needsConfirmation(resolvedWith("high"), false)).toBe(false);
  });
});
