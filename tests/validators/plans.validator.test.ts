import { describe, expect, it } from "vitest";

import {
  planSchema,
  patchPlanSchema,
} from "../../src/validators/plans.validator";

describe("createPlanSchema", () => {
  const validPlan = {
    name: "Custom Plan",
    scope: "user",
    monthlyAllowance: 5000,
    maxUnitsPerRequest: 500,
  };

  it("accepts a valid custom plan", () => {
    expect(planSchema.safeParse(validPlan).success).toBe(true);
  });

  it.each([
    ["empty name", { ...validPlan, name: "" }],
    ["invalid scope", { ...validPlan, scope: "company" }],
    ["negative monthly allowance", { ...validPlan, monthlyAllowance: -1 }],
    ["decimal monthly allowance", { ...validPlan, monthlyAllowance: 1.5 }],
    ["zero max units per request", { ...validPlan, maxUnitsPerRequest: 0 }],
    [
      "negative max units per request",
      { ...validPlan, maxUnitsPerRequest: -1 },
    ],
    [
      "decimal max units per request",
      { ...validPlan, maxUnitsPerRequest: 2.5 },
    ],
    [
      "missing plan name",
      {
        scope: "user",
        monthlyAllowance: 5000,
        maxUnitsPerRequest: 500,
      },
    ],
  ])("rejects %s", (_description, data) => {
    expect(planSchema.safeParse(data).success).toBe(false);
  });

  it("allows a monthly allowance of zero", () => {
    expect(
      planSchema.safeParse({
        ...validPlan,
        monthlyAllowance: 0,
      }).success,
    ).toBe(true);
  });
});

describe("patchPlanSchema", () => {
  it("accepts a partial update", () => {
    expect(patchPlanSchema.safeParse({ monthlyAllowance: 10000 }).success).toBe(
      true,
    );
  });

  it("accepts a name-only update", () => {
    expect(patchPlanSchema.safeParse({ name: "Updated Plan" }).success).toBe(
      true,
    );
  });

  it("rejects an empty update", () => {
    expect(patchPlanSchema.safeParse({}).success).toBe(false);
  });

  it("rejects invalid numeric limits", () => {
    expect(patchPlanSchema.safeParse({ maxUnitsPerRequest: 0 }).success).toBe(
      false,
    );
  });
});
