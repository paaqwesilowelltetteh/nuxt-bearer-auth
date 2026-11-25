import { beforeEach, describe, expect, it, vi } from "vitest";

const validateMock = vi.hoisted(() => vi.fn());
const setHeaderMock = vi.hoisted(() => vi.fn());

vi.mock("../src/runtime/server/utils/sessions", () => ({
  validateBearerAuthSession: validateMock,
}));

vi.mock("h3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("h3")>();
  return {
    ...actual,
    defineEventHandler: (handler: any) => handler,
    setResponseHeader: setHeaderMock,
  };
});

import sessionHandler from "../src/runtime/server/api/auth/session.get";

describe("GET session liveness endpoint", () => {
  beforeEach(() => {
    validateMock.mockReset();
    setHeaderMock.mockReset();
  });

  it("returns only a positive validity discriminator and disables caching", async () => {
    validateMock.mockResolvedValueOnce(true);
    const result = await sessionHandler({} as any);

    expect(result).toEqual({ valid: true });
    expect(JSON.stringify(result)).not.toMatch(/token|sessionId|userId|cookie/i);
    expect(setHeaderMock).toHaveBeenCalledWith(
      expect.anything(),
      "Cache-Control",
      "private, no-store, max-age=0",
    );
  });

  it("returns 401 for a missing or invalid session", async () => {
    validateMock.mockResolvedValueOnce(false);
    await expect(sessionHandler({} as any)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("does not convert Redis failures into unauthenticated responses", async () => {
    const redisError = new Error("Redis unavailable");
    validateMock.mockRejectedValueOnce(redisError);
    await expect(sessionHandler({} as any)).rejects.toBe(redisError);
  });
});
