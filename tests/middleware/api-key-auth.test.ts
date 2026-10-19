import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

vi.mock("../../src/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

import { db } from "../../src/db";
import { apiKeyAuth } from "../../src/middleware/api-key-auth";

const selectMock = vi.mocked(db.select);
const limitMock = vi.fn();

function makeResponse() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
}

function makeRequest(authorization?: string) {
  return {
    header: vi.fn().mockReturnValue(authorization),
    account: undefined,
  };
}

function mockAccountQuery(account: unknown) {
  const where = vi.fn().mockReturnValue({
    limit: limitMock,
  });

  const from = vi.fn().mockReturnValue({ where });

  selectMock.mockReturnValue({ from } as never);
  limitMock.mockResolvedValue(account ? [account] : []);

  return { from, where };
}

describe("apiKeyAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the Authorization header is missing", async () => {
    const req = makeRequest();
    const res = makeResponse();
    const next = vi.fn();

    await apiKeyAuth(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it.each(["invalid", "Basic abc123", "Bearer ", "Bearer key with spaces"])(
    "rejects malformed Authorization header: %s",
    async (header) => {
      const req = makeRequest(header);
      const res = makeResponse();
      const next = vi.fn();

      await apiKeyAuth(req as never, res as never, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    },
  );

  it("rejects an unknown API key", async () => {
    mockAccountQuery(null);

    const req = makeRequest("Bearer um_live_invalid");
    const res = makeResponse();
    const next = vi.fn();

    await apiKeyAuth(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("hashes the API key before querying the database", async () => {
    const apiKey = "um_live_test_key";
    const expectedHash = createHash("sha256").update(apiKey).digest("hex");

    const { where } = mockAccountQuery({
      id: 7,
      name: "Test Account",
    });

    const req = makeRequest(`Bearer ${apiKey}`);
    const res = makeResponse();
    const next = vi.fn();

    await apiKeyAuth(req as never, res as never, next);

    expect(where).toHaveBeenCalledOnce();

    // The middleware must not store the raw key in the database.
    expect(expectedHash).toHaveLength(64);
    expect(next).toHaveBeenCalledOnce();
    expect(req.account).toEqual({
      id: 7,
      name: "Test Account",
    });
  });

  it("accepts a valid key with a case-insensitive Bearer prefix", async () => {
    mockAccountQuery({ id: 7, name: "Test Account" });

    const req = makeRequest("bearer um_live_valid_key");
    const res = makeResponse();
    const next = vi.fn();

    await apiKeyAuth(req as never, res as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.account).toEqual({
      id: 7,
      name: "Test Account",
    });
  });

  it("forwards database errors to next()", async () => {
    const databaseError = new Error("Database unavailable");

    const where = vi.fn().mockReturnValue({
      limit: vi.fn().mockRejectedValue(databaseError),
    });

    const from = vi.fn().mockReturnValue({ where });
    selectMock.mockReturnValue({ from } as never);

    const req = makeRequest("Bearer um_live_valid_key");
    const res = makeResponse();
    const next = vi.fn();

    await apiKeyAuth(req as never, res as never, next);

    expect(next).toHaveBeenCalledWith(databaseError);
  });
});
