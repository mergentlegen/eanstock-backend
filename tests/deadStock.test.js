const { calculateDeadStockPrice } = require("../src/services/inventory.service");

describe("dead stock decay formula", () => {
  test("applies configurable decay after age and interval thresholds", () => {
    const now = new Date("2026-04-27T12:00:00.000Z");
    const result = calculateDeadStockPrice({
      currentPrice: 10000,
      basePrice: 10000,
      receivedAt: new Date("2026-03-01T12:00:00.000Z"),
      lastDecayAt: new Date("2026-04-20T12:00:00.000Z"),
      now,
      deadStockAfterDays: 30,
      decayPercent: 15,
      decayIntervalHours: 72,
      minPricePercent: 50,
    });

    expect(result.shouldDecay).toBe(true);
    expect(result.nextPrice).toBe(8500);
  });

  test("never discounts below configured floor", () => {
    const now = new Date("2026-04-27T12:00:00.000Z");
    const result = calculateDeadStockPrice({
      currentPrice: 5200,
      basePrice: 10000,
      receivedAt: new Date("2026-01-01T12:00:00.000Z"),
      lastDecayAt: new Date("2026-04-20T12:00:00.000Z"),
      now,
      deadStockAfterDays: 30,
      decayPercent: 20,
      decayIntervalHours: 72,
      minPricePercent: 50,
    });

    expect(result.shouldDecay).toBe(true);
    expect(result.nextPrice).toBe(5000);
  });
});
