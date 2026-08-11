import { FetchError } from "ofetch";
import { createError } from "h3";

export function toPublicError(error: unknown, fallback = "Request failed"): never {
  if (error instanceof FetchError) {
    const statusCode = error.response?.status || error.statusCode || 500;
    const data = error.response?._data as
      | { message?: string; errors?: unknown; data?: unknown }
      | undefined;

    throw createError({
      statusCode,
      statusMessage: data?.message || error.message || fallback,
      data,
    });
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error
  ) {
    throw error;
  }

  throw createError({
    statusCode: 500,
    statusMessage: error instanceof Error ? error.message : fallback,
  });
}
