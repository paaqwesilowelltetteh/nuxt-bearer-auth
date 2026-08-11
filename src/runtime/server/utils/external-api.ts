import { $fetch, type FetchOptions } from "ofetch";
import type { H3Event } from "h3";
import { getBearerAuthConfig, requireApiBaseUrl } from "./config";
import { getBearerAuthSession } from "./sessions";
import type { BearerAuthEndpointOptions } from "../../../types";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ExternalApiOptions {
  event?: H3Event;
  method?: HttpMethod;
  body?: unknown;
  query?: Record<string, unknown>;
  token?: string;
  headers?: Record<string, string>;
}

export async function callAuthApi<T = unknown>(
  endpoint: string,
  options: ExternalApiOptions = {},
) {
  const baseURL = requireApiBaseUrl();
  const method = options.method || "POST";
  let token = options.token;

  if (!token && options.event) {
    const session = await getBearerAuthSession(options.event);
    token = session?.token;
  }

  const fetchOptions: FetchOptions<"json"> = {
    baseURL,
    method,
    query: options.query,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    retry: 0,
  };

  if (options.body !== undefined && method !== "GET") {
    fetchOptions.body = options.body;
  }

  return await $fetch<T>(endpoint, fetchOptions);
}

export function getAuthEndpoint(name: keyof BearerAuthEndpointOptions) {
  return getBearerAuthConfig().endpoints[name];
}
