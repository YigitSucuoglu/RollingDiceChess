import { describe, expect, it } from "vitest";
import { COLLECTION_FILTERS, collectionItems } from "../../src/application/achievements/AchievementCollectionFilter";

describe("achievement collection filters", () => {
  it("partition the 30 unique catalog achievements into the five product categories", () => {
    const counts = COLLECTION_FILTERS.map((filter) => collectionItems(filter).length);
    expect(counts).toEqual([30, 7, 6, 6, 3, 8]);
    const ids = COLLECTION_FILTERS.slice(1).flatMap((filter) => collectionItems(filter).map((item) => item.id));
    expect(new Set(ids).size).toBe(30);
    expect(new Set(collectionItems("all").map((item) => item.id))).toEqual(new Set(ids));
  });
});
