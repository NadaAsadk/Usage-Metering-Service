import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db", () => ({
  db: {
    transaction: vi.fn(),
  },
}));

vi.mock("../../src/repositories/consumptions.repository", () => ({
  lockAccount: vi.fn(),
  findPreviousConsumption: vi.fn(),
  findAccountPlan: vi.fn(),
  findUserPlan: vi.fn(),
  findAccountCounter: vi.fn(),
  findUserCounter: vi.fn(),
  createConsumption: vi.fn(),
  updateAccountCounter: vi.fn(),
  createAccountCounter: vi.fn(),
  updateUserCounter: vi.fn(),
  createUserCounter: vi.fn(),
  listConsumptions: vi.fn(),
}));

import { db } from "../../src/db";
import * as repository from "../../src/repositories/consumptions.repository";
import {
  consume,
  getConsumptions,
} from "../../src/services/consumptions.service";

const tx = {} as never;

const accountPlan = {
  id: 1,
  name: "Business",
  scope: "account" as const,
  monthlyAllowance: 1000,
  maxUnitsPerRequest: 100,
};

const userPlan = {
  userId: 10,
  externalUserId: "customer-10",
  id: 2,
  name: "Basic",
  scope: "user" as const,
  monthlyAllowance: 100,
  maxUnitsPerRequest: 50,
};

const acceptedRecord = { id: 101 };

function configureTransaction() {
  vi.mocked(db.transaction).mockImplementation((async (
    callback: (transaction: never) => unknown,
  ) => callback(tx)) as never);
}

function configureSuccessfulLookup() {
  vi.mocked(repository.findPreviousConsumption).mockResolvedValue(
    undefined as never,
  );
  vi.mocked(repository.findAccountPlan).mockResolvedValue(accountPlan as never);
  vi.mocked(repository.findUserPlan).mockResolvedValue(userPlan as never);
  vi.mocked(repository.findAccountCounter).mockResolvedValue({
    consumedUnits: 20,
  } as never);
  vi.mocked(repository.findUserCounter).mockResolvedValue({
    consumedUnits: 5,
  } as never);
  vi.mocked(repository.createConsumption).mockResolvedValue(
    acceptedRecord as never,
  );
}

describe("consumptions service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    configureTransaction();
    configureSuccessfulLookup();
  });

  it("locks the account before checking the request", async () => {
    await consume(1, 10, "request-1", 10);

    expect(repository.lockAccount).toHaveBeenCalledWith(tx, 1);
    expect(
      vi.mocked(repository.lockAccount).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(repository.findPreviousConsumption).mock.invocationCallOrder[0],
    );
  });

  it("accepts a valid request and records it", async () => {
    const result = await consume(1, 10, "request-1", 10);

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      status: "accepted",
      requestId: "request-1",
      consumptionId: 101,
      units: 10,
      usage: {
        account: { consumed: 30, limit: 1000, remaining: 970 },
        user: { consumed: 15, limit: 100, remaining: 85 },
      },
    });

    expect(repository.createConsumption).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        accountId: 1,
        userId: 10,
        requestId: "request-1",
        units: 10,
        status: "accepted",
        rejectionScope: null,
        rejectionReason: null,
      }),
    );
  });

  it("increments both counters by the requested units", async () => {
    await consume(1, 10, "request-2", 10);

    expect(repository.updateAccountCounter).toHaveBeenCalledWith(
      tx,
      1,
      expect.any(String),
      30,
      expect.any(Date),
    );

    expect(repository.updateUserCounter).toHaveBeenCalledWith(
      tx,
      1,
      10,
      "2026-10-01",
      15,
      expect.any(Date),
    );
  });

  it("returns the original decision when requestId is replayed", async () => {
    vi.mocked(repository.findPreviousConsumption).mockResolvedValue({
      id: 77,
      userId: 10,
      units: 5,
      status: "accepted",
      requestId: "duplicate-1",
      rejectionScope: null,
      rejectionReason: null,
    } as never);

    const result = await consume(1, 10, "duplicate-1", 5);

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      status: "accepted",
      requestId: "duplicate-1",
      units: 5,
      idempotentReplay: true,
    });

    expect(repository.createConsumption).not.toHaveBeenCalled();
    expect(repository.updateAccountCounter).not.toHaveBeenCalled();
    expect(repository.updateUserCounter).not.toHaveBeenCalled();
    expect(repository.createAccountCounter).not.toHaveBeenCalled();
    expect(repository.createUserCounter).not.toHaveBeenCalled();
  });

  it("rejects reuse of requestId with different input", async () => {
    vi.mocked(repository.findPreviousConsumption).mockResolvedValue({
      id: 77,
      userId: 10,
      units: 5,
      status: "accepted",
      requestId: "duplicate-2",
      rejectionScope: null,
      rejectionReason: null,
    } as never);

    const result = await consume(1, 10, "duplicate-2", 9);

    expect(result.statusCode).toBe(409);
    expect(result.body).toMatchObject({
      error: "Idempotency conflict",
    });
    expect(repository.createConsumption).not.toHaveBeenCalled();
    expect(repository.updateAccountCounter).not.toHaveBeenCalled();
  });

  it("returns 404 when the user does not belong to the account", async () => {
    vi.mocked(repository.findUserPlan).mockResolvedValue(undefined as never);

    const result = await consume(1, 999, "request-3", 10);

    expect(result.statusCode).toBe(404);
    expect(result.body).toMatchObject({ error: "User not found" });
    expect(repository.createConsumption).not.toHaveBeenCalled();
    expect(repository.updateAccountCounter).not.toHaveBeenCalled();
  });

  it("throws when the account plan is missing", async () => {
    vi.mocked(repository.findAccountPlan).mockResolvedValue(undefined as never);

    await expect(consume(1, 10, "request-4", 10)).rejects.toThrow(
      "Account plan or plan rules are missing.",
    );
  });

  it.each([
    {
      name: "account per-request limit",
      units: 101,
      accountLimit: 100,
      userLimit: 200,
      accountAllowance: 1000,
      userAllowance: 1000,
      accountUsed: 0,
      userUsed: 0,
      scope: "account",
      reason: "ACCOUNT_MAX_UNITS_PER_REQUEST_EXCEEDED",
    },
    {
      name: "user per-request limit",
      units: 51,
      accountLimit: 100,
      userLimit: 50,
      accountAllowance: 1000,
      userAllowance: 1000,
      accountUsed: 0,
      userUsed: 0,
      scope: "user",
      reason: "USER_MAX_UNITS_PER_REQUEST_EXCEEDED",
    },
    {
      name: "account monthly allowance",
      units: 10,
      accountLimit: 100,
      userLimit: 50,
      accountAllowance: 25,
      userAllowance: 1000,
      accountUsed: 20,
      userUsed: 0,
      scope: "account",
      reason: "ACCOUNT_MONTHLY_ALLOWANCE_EXCEEDED",
    },
    {
      name: "user monthly allowance",
      units: 10,
      accountLimit: 100,
      userLimit: 50,
      accountAllowance: 1000,
      userAllowance: 10,
      accountUsed: 0,
      userUsed: 5,
      scope: "user",
      reason: "USER_MONTHLY_ALLOWANCE_EXCEEDED",
    },
  ])("rejects requests exceeding $name", async (testCase) => {
    vi.mocked(repository.findAccountPlan).mockResolvedValue({
      ...accountPlan,
      maxUnitsPerRequest: testCase.accountLimit,
      monthlyAllowance: testCase.accountAllowance,
    } as never);

    vi.mocked(repository.findUserPlan).mockResolvedValue({
      ...userPlan,
      maxUnitsPerRequest: testCase.userLimit,
      monthlyAllowance: testCase.userAllowance,
    } as never);

    vi.mocked(repository.findAccountCounter).mockResolvedValue({
      consumedUnits: testCase.accountUsed,
    } as never);

    vi.mocked(repository.findUserCounter).mockResolvedValue({
      consumedUnits: testCase.userUsed,
    } as never);

    const result = await consume(
      1,
      10,
      `reject-${testCase.name}`,
      testCase.units,
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      status: "rejected",
      rejectionScope: testCase.scope,
      rejectionReason: testCase.reason,
    });

    expect(repository.createConsumption).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        status: "rejected",
        rejectionScope: testCase.scope,
        rejectionReason: testCase.reason,
      }),
    );

    expect(repository.updateAccountCounter).not.toHaveBeenCalled();
    expect(repository.updateUserCounter).not.toHaveBeenCalled();
    expect(repository.createAccountCounter).not.toHaveBeenCalled();
    expect(repository.createUserCounter).not.toHaveBeenCalled();
  });

  it("creates counters when no monthly counters exist yet", async () => {
    vi.mocked(repository.findAccountCounter).mockResolvedValue(
      undefined as never,
    );
    vi.mocked(repository.findUserCounter).mockResolvedValue(undefined as never);

    const result = await consume(1, 10, "first-request", 10);

    expect(result.body).toMatchObject({
      status: "accepted",
      usage: {
        account: { consumed: 10 },
        user: { consumed: 10 },
      },
    });

    expect(repository.createAccountCounter).toHaveBeenCalledWith(
      tx,
      1,
      expect.any(String),
      10,
      expect.any(Date),
    );

    expect(repository.createUserCounter).toHaveBeenCalledWith(
      tx,
      1,
      10,
      expect.any(String),
      10,
      expect.any(Date),
    );
  });

  it("lists consumptions with pagination metadata", async () => {
    const records = [{ id: 1 }, { id: 2 }];
    vi.mocked(repository.listConsumptions).mockResolvedValue(records as never);

    const result = await getConsumptions(1, {
      limit: 20,
      offset: 10,
    });

    expect(repository.listConsumptions).toHaveBeenCalledWith(1, {
      limit: 20,
      offset: 10,
    });

    expect(result).toEqual({
      consumptions: records,
      pagination: {
        limit: 20,
        offset: 10,
        returned: 2,
      },
    });
  });
});
