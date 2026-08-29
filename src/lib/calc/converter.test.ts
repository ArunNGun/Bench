import { describe, expect, it } from "vitest";
import { converterUrl } from "./converter";

describe("converterUrl", () => {
  it("asks the question a person would type", () => {
    const url = converterUrl(60, "USD", "EUR")!;
    expect(decodeURIComponent(url)).toContain("60 USD to EUR");
  });

  it("escapes the query rather than pasting it in raw", () => {
    // The amount and the codes end up in someone else's URL, so they are
    // encoded rather than trusted to be safe.
    expect(converterUrl(60, "USD", "EUR")).toContain("60%20USD%20to%20EUR");
  });

  it("rounds to something a person would recognise", () => {
    // 200/3 as a share of a kit is 66.66666666666667, and a URL carrying that
    // reads as a machine talking to itself.
    expect(decodeURIComponent(converterUrl(200 / 3, "USD", "EUR")!)).toContain("66.67 USD");
  });

  it("offers nothing when there is nothing to convert", () => {
    expect(converterUrl(0, "USD", "EUR")).toBeNull();
    expect(converterUrl(-5, "USD", "EUR")).toBeNull();
  });

  it("offers nothing when both sides are the same currency", () => {
    expect(converterUrl(60, "EUR", "EUR")).toBeNull();
  });

  it("offers nothing when a currency is missing", () => {
    expect(converterUrl(60, "", "EUR")).toBeNull();
    expect(converterUrl(60, "EUR", "")).toBeNull();
  });

  it("is a link and not a request", () => {
    // The whole point of the decision behind this file: the app never fetches
    // a rate, so nothing leaves the device until somebody opens the link.
    expect(converterUrl(60, "USD", "EUR")).toMatch(/^https:\/\//);
  });
});
