import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/plans.repository", () => ({
  findAllPlans: vi.fn(),
  findPlanById: vi.fn(),
  findPlanByNameAndScope: vi.fn(),
  createCustomPlan: vi.fn(),
  findPlanForUpdate: vi.fn(),
  updateCustomPlan: vi.fn(),
}));

import * as plansRepository from "../../src/repositories/plans.repository";
import {
  PlanServiceError,
  createPlan,
  getAllPlans,
  getPlan,
  updatePlan,
} from "../../src/services/plans.service";

const repo = vi.mocked(plansRepository);

const customPlan = {
  id: 10,
  name: "Premium",
  scope: "user" as const,
  isPredefined: false,
  ownerAccountId: 1,
  monthlyAllowance: 5000,
  maxUnitsPerRequest: 500,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

const predefinedPlan = {
  ...customPlan,
  id: 2,
  name: "Basic",
  isPredefined: true,
  ownerAccountId: null,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("plan ownership", () => {
  it("allows an account to update its own custom plan", async () => {
    repo.findPlanForUpdate.mockResolvedValue({
      id: 10,
      isPredefined: false,
      ownerAccountId: 1,
    });
    repo.updateCustomPlan.mockResolvedValue({
      ...customPlan,
      name: "Premium Plus",
    });

    const result = await updatePlan(10, 1, {
      name: "Premium Plus",
    });

    expect(repo.updateCustomPlan).toHaveBeenCalledWith(10, 1, {
      name: "Premium Plus",
    });
    expect(result.name).toBe("Premium Plus");
  });

  it("does not allow another account to update a custom plan", async () => {
    repo.findPlanForUpdate.mockResolvedValue({
      id: 10,
      isPredefined: false,
      ownerAccountId: 1,
    });

    await expect(
      updatePlan(10, 2, { name: "Stolen Plan" }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Plan not found",
    });

    expect(repo.updateCustomPlan).not.toHaveBeenCalled();
  });

  it("does not allow editing predefined plans", async () => {
    repo.findPlanForUpdate.mockResolvedValue({
      id: 2,
      isPredefined: true,
      ownerAccountId: null,
    });

    await expect(
      updatePlan(2, 1, { name: "Changed Basic" }),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Predefined plans cannot be modified.",
    });

    expect(repo.updateCustomPlan).not.toHaveBeenCalled();
  });

  it("returns 404 when the plan does not exist", async () => {
    repo.findPlanForUpdate.mockResolvedValue(null);

    await expect(updatePlan(999, 1, { name: "Missing" })).rejects.toMatchObject(
      {
        statusCode: 404,
        message: "Plan not found",
      },
    );
  });

  it("allows two accounts to use the same custom plan name", async () => {
    repo.findPlanByNameAndScope.mockResolvedValue(null);
    repo.createCustomPlan.mockResolvedValue({
      ...customPlan,
      ownerAccountId: 2,
    });

    await createPlan(2, {
      name: "Premium",
      scope: "user",
      monthlyAllowance: 5000,
      maxUnitsPerRequest: 500,
    });

    expect(repo.findPlanByNameAndScope).toHaveBeenCalledWith(
      "Premium",
      "user",
      2,
    );

    expect(repo.createCustomPlan).toHaveBeenCalledWith({
      name: "Premium",
      scope: "user",
      monthlyAllowance: 5000,
      maxUnitsPerRequest: 500,
      accountId: 2,
    });
  });

  it("rejects a name already used by a predefined or own plan", async () => {
    repo.findPlanByNameAndScope.mockResolvedValue({ id: 3 });

    await expect(
      createPlan(1, {
        name: "Basic",
        scope: "user",
        monthlyAllowance: 5000,
        maxUnitsPerRequest: 500,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Plan already exists",
    });

    expect(repo.createCustomPlan).not.toHaveBeenCalled();
  });

  it("returns only plans visible to the requested account", async () => {
    repo.findAllPlans.mockResolvedValue([predefinedPlan, customPlan]);

    await getAllPlans(1);

    expect(repo.findAllPlans).toHaveBeenCalledWith(1);
  });

  it("does not expose custom plans through the public list", async () => {
    repo.findAllPlans.mockResolvedValue([predefinedPlan]);

    await getAllPlans();

    expect(repo.findAllPlans).toHaveBeenCalledWith(undefined);
  });

  it("returns 404 for a plan not visible to the account", async () => {
    repo.findPlanById.mockResolvedValue(null);

    await expect(getPlan(10, 2)).rejects.toMatchObject({
      statusCode: 404,
      message: "Plan not found",
    });

    expect(repo.findPlanById).toHaveBeenCalledWith(10, 2);
  });
});
