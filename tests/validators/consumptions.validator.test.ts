import { describe, expect, it } from "vitest";

import {
  consumeSchema,
  consumptionQuerySchema,
} from "../../src/validators/consumptions.validator";

describe("consumeSchema", () => {
  it("accepts valid consumption data", () => {
    const result = consumeSchema.safeParse({
      userId: 1,
      requestId: "request-123",
      units: 10,
    });

    expect(result.success).toBe(true);
  });

  it("trims whitespace from requestId", () => {
    const result = consumeSchema.safeParse({
      userId: 1,
      requestId: "  request-123  ",
      units: 10,
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.requestId).toBe("request-123");
    }
  });

  it("accepts the minimum valid values", () => {
    const result = consumeSchema.safeParse({
      userId: 1,
      requestId: "a",
      units: 1,
    });

    expect(result.success).toBe(true);
  });

  it("accepts the maximum safe integer values", () => {
    const result = consumeSchema.safeParse({
      userId: Number.MAX_SAFE_INTEGER,
      requestId: "request-123",
      units: Number.MAX_SAFE_INTEGER,
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ["missing userId", { requestId: "request-123", units: 10 }],
    ["missing requestId", { userId: 1, units: 10 }],
    ["missing units", { userId: 1, requestId: "request-123" }],
    ["empty requestId", { userId: 1, requestId: "", units: 10 }],
    ["whitespace-only requestId", { userId: 1, requestId: "   ", units: 10 }],
    [
      "requestId longer than 200 characters",
      { userId: 1, requestId: "x".repeat(201), units: 10 },
    ],
    ["zero userId", { userId: 0, requestId: "request-123", units: 10 }],
    ["negative userId", { userId: -1, requestId: "request-123", units: 10 }],
    ["fractional userId", { userId: 1.5, requestId: "request-123", units: 10 }],
    [
      "unsafe userId",
      {
        userId: Number.MAX_SAFE_INTEGER + 1,
        requestId: "request-123",
        units: 10,
      },
    ],
    ["string userId", { userId: "1", requestId: "request-123", units: 10 }],
    ["zero units", { userId: 1, requestId: "request-123", units: 0 }],
    ["negative units", { userId: 1, requestId: "request-123", units: -1 }],
    ["fractional units", { userId: 1, requestId: "request-123", units: 1.5 }],
    [
      "unsafe units",
      {
        userId: 1,
        requestId: "request-123",
        units: Number.MAX_SAFE_INTEGER + 1,
      },
    ],
    ["string units", { userId: 1, requestId: "request-123", units: "10" }],
  ])("rejects %s", (_description, data) => {
    expect(consumeSchema.safeParse(data).success).toBe(false);
  });
});

describe("consumptionQuerySchema", () => {
  it("accepts an empty query and applies default values", () => {
    const result = consumptionQuerySchema.safeParse({});

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data).toEqual({
        limit: 20,
        offset: 0,
      });
    }
  });

  it("accepts valid query parameters as strings", () => {
    const result = consumptionQuerySchema.safeParse({
      limit: "50",
      offset: "10",
      userId: "5",
      status: "accepted",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data).toEqual({
        limit: 50,
        offset: 10,
        userId: 5,
        status: "accepted",
      });
    }
  });

  it("accepts rejected status", () => {
    const result = consumptionQuerySchema.safeParse({
      status: "rejected",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.status).toBe("rejected");
    }
  });

  it("accepts the maximum limit", () => {
    const result = consumptionQuerySchema.safeParse({
      limit: "100",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.limit).toBe(100);
    }
  });

  it("accepts zero offset", () => {
    const result = consumptionQuerySchema.safeParse({
      offset: "0",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.offset).toBe(0);
    }
  });

  it("accepts the maximum safe userId", () => {
    const result = consumptionQuerySchema.safeParse({
      userId: String(Number.MAX_SAFE_INTEGER),
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.userId).toBe(Number.MAX_SAFE_INTEGER);
    }
  });

  it.each([
    ["zero limit", { limit: "0" }],
    ["negative limit", { limit: "-1" }],
    ["limit above 100", { limit: "101" }],
    ["fractional limit", { limit: "1.5" }],
    ["non-numeric limit", { limit: "abc" }],
    ["negative offset", { offset: "-1" }],
    ["fractional offset", { offset: "1.5" }],
    ["non-numeric offset", { offset: "abc" }],
    ["zero userId", { userId: "0" }],
    ["negative userId", { userId: "-1" }],
    ["fractional userId", { userId: "1.5" }],
    ["non-numeric userId", { userId: "abc" }],
    ["unsafe userId", { userId: String(Number.MAX_SAFE_INTEGER + 1) }],
    ["invalid status", { status: "pending" }],
    ["empty status", { status: "" }],
  ])("rejects %s", (_description, query) => {
    expect(consumptionQuerySchema.safeParse(query).success).toBe(false);
  });

  it("rejects null limit", () => {
    expect(consumptionQuerySchema.safeParse({ limit: null }).success).toBe(
      false,
    );
  });
});
