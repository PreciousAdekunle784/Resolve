import { describe, expect, it } from "vitest";
import { countAdvancedFilters, filtersToSearchParams, parseCaseFilters, periodStart, sanitizeSearch } from "./case-filters";

describe("case filters", () => {
  it("parses and validates URL parameters", () => {
    const f = parseCaseFilters({
      filter: "awaiting",
      period: "30d",
      status: "resolved,closed,hacked",
      category: "duplicate_transaction",
      channel: "pos,nope",
      min: "1,000",
      max: "abc",
      q: "Zenith",
    });
    expect(f).toEqual({
      view: "awaiting",
      period: "30d",
      statuses: ["resolved", "closed"],
      categories: ["duplicate_transaction"],
      channels: ["pos"],
      min: 1000,
      max: null,
      q: "Zenith",
    });
    expect(countAdvancedFilters(f)).toBe(5);
  });

  it("falls back to safe defaults", () => {
    const f = parseCaseFilters({ filter: "drop table", period: "forever" });
    expect(f.view).toBe("all");
    expect(f.period).toBe("any");
  });

  it("strips characters that could alter the database filter", () => {
    expect(sanitizeSearch("zenith),user_id.eq.(x")).toBe("zenith user_id.eq. x");
    expect(sanitizeSearch("NIP*%,()")).toBe("NIP");
  });

  it("round-trips to URL parameters", () => {
    const f = parseCaseFilters({ status: "draft", q: "GTBank" });
    expect(filtersToSearchParams(f).toString()).toBe("status=draft&q=GTBank");
  });

  it("computes period start dates", () => {
    expect(periodStart(7, new Date("2026-11-08T00:00:00Z"))).toBe("2026-11-01T00:00:00.000Z");
  });
});
