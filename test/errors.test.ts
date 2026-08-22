import { describe, expect, it } from "vitest";
import { FetchError, type FetchResponse } from "ofetch";
import { createError } from "h3";
import { toPublicError } from "../src/runtime/server/utils/errors";

describe("errors utility - toPublicError", () => {
  it("normalizes ofetch FetchError with response status and custom message", () => {
    const response: Partial<FetchResponse<any>> = {
      status: 422,
      _data: {
        message: "The email has already been taken.",
        errors: { email: ["The email has already been taken."] },
      },
    };
    const fetchError = new FetchError("Fetch failed");
    fetchError.response = response as FetchResponse<any>;
    fetchError.statusCode = 422;

    try {
      toPublicError(fetchError, "Fallback message");
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.statusCode).toBe(422);
      expect(err.statusMessage).toBe("The email has already been taken.");
      expect(err.data).toEqual(response._data);
    }
  });

  it("normalizes ofetch FetchError when statusMessage or message is in response", () => {
    const response: Partial<FetchResponse<any>> = {
      status: 401,
      _data: { message: "Invalid bearer credentials" },
    };
    const fetchError = new FetchError("401 Unauthorized");
    fetchError.response = response as FetchResponse<any>;

    try {
      toPublicError(fetchError);
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.statusCode).toBe(401);
      expect(err.statusMessage).toBe("Invalid bearer credentials");
    }
  });

  it("re-throws H3Error or object with statusCode directly", () => {
    const customH3Error = createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });

    try {
      toPublicError(customH3Error);
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).toBe(customH3Error);
      expect(err.statusCode).toBe(401);
      expect(err.statusMessage).toBe("Authentication required");
    }
  });

  it("normalizes generic standard Error to 500", () => {
    const error = new Error("Something broke internally");

    try {
      toPublicError(error, "Default fallback");
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.statusCode).toBe(500);
      expect(err.statusMessage).toBe("Something broke internally");
    }
  });

  it("normalizes non-error primitive throws to 500 with fallback", () => {
    try {
      toPublicError("string error", "Default fallback");
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.statusCode).toBe(500);
      expect(err.statusMessage).toBe("Default fallback");
    }
  });
});
