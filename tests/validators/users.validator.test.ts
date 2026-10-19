import { describe, expect, it } from "vitest";

import {
  createUserSchema,
  patchUserPlanSchema,
} from "../../src/validators/users.validator";

describe("createUserSchema", () => {
  it("accepts valid user data", () => {
    const result = createUserSchema.safeParse({
      externalUserId: "customer-123",
      planName: "Basic",
    });

    expect(result.success).toBe(true);
  });

  it("trims whitespace from values", () => {
    const result = createUserSchema.safeParse({
      externalUserId: "  customer-123  ",
      planName: "  Basic  ",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.externalUserId).toBe("customer-123");
      expect(result.data.planName).toBe("Basic");
    }
  });

  it.each([
    ["empty externalUserId", { externalUserId: "", planName: "Basic" }],
    ["missing externalUserId", { planName: "Basic" }],
    ["empty planName", { externalUserId: "user-1", planName: "" }],
    ["missing planName", { externalUserId: "user-1" }],
    [
      "externalUserId too long",
      { externalUserId: "x".repeat(256), planName: "Basic" },
    ],
    [
      "planName too long",
      { externalUserId: "user-1", planName: "x".repeat(101) },
    ],
  ])("rejects %s", (_description, data) => {
    expect(createUserSchema.safeParse(data).success).toBe(false);
  });
});

describe("patchUserPlanSchema", () => {
  it("accepts a valid plan name", () => {
    expect(patchUserPlanSchema.safeParse({ planName: "Power" }).success).toBe(
      true,
    );
  });

  it("rejects an empty plan name", () => {
    expect(patchUserPlanSchema.safeParse({ planName: "" }).success).toBe(false);
  });

  it("rejects a missing plan name", () => {
    expect(patchUserPlanSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a plan name longer than 100 characters", () => {
    expect(
      patchUserPlanSchema.safeParse({
        planName: "x".repeat(101),
      }).success,
    ).toBe(false);
  });
});
