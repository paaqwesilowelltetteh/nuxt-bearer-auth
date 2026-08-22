import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "redis";
import type { H3Event } from "h3";

let mockConfig = {
  apiBaseUrl: "https://api.example.com",
  redisUrl: "redis://127.0.0.1:6379",
  sessionSecret: "",
  appEnv: "development",
  sessionCookie: {
    name: "nuxt_bearer_auth_session",
    devName: "nuxt_bearer_auth_session_dev",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax" as const,
    secure: undefined,
    domain: undefined,
    path: "/",
  },
};

vi.mock("../src/runtime/server/utils/config", () => ({
  getBearerAuthConfig: () => mockConfig,
  getSessionCookieName: () =>
    mockConfig.appEnv === "development" || mockConfig.appEnv === "local"
      ? mockConfig.sessionCookie.devName
      : mockConfig.sessionCookie.name,
  isProductionRuntime: () => mockConfig.appEnv === "production",
}));

import {
  createBearerAuthSession,
  deleteUserBearerAuthSession,
  destroyAllBearerAuthSessions,
  destroyBearerAuthSession,
  ensureBearerAuthRedisConnection,
  getBearerAuthRedisClient,
  getBearerAuthSession,
  getUserBearerAuthSessions,
  requireBearerAuthSession,
  updateBearerAuthSession,
} from "../src/runtime/server/utils/sessions";

function createMockEvent(cookies: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const setCookies: Array<{ name: string; value: string; options: any }> = [];
  const event: Partial<H3Event> = {
    node: {
      req: {
        headers: {
          cookie: Object.entries(cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join("; "),
          "user-agent": headers["user-agent"] || "Vitest/1.0",
          ...headers,
        },
        socket: {
          remoteAddress: "127.0.0.1",
        },
      } as any,
      res: {
        setHeader: (name: string, value: any) => {
          if (name.toLowerCase() === "set-cookie") {
            const arr = Array.isArray(value) ? value : [value];
            arr.forEach((cookieStr: string) => {
              const [nv] = cookieStr.split(";");
              const [k, v] = nv.split("=");
              setCookies.push({ name: k.trim(), value: v ? v.trim() : "", options: cookieStr });
            });
          }
        },
        getHeader: () => undefined,
      } as any,
    },
    context: {},
  };
  return { event: event as H3Event, setCookies };
}

describe("sessions management with Redis", () => {
  let redis: ReturnType<typeof createClient>;

  beforeEach(async () => {
    redis = await ensureBearerAuthRedisConnection();
    // Flush test db keys
    const keys = await redis.keys("session:*");
    const userKeys = await redis.keys("user_sessions:*");
    const allKeys = [...keys, ...userKeys];
    if (allKeys.length > 0) {
      await redis.del(allKeys);
    }
  });

  afterAll(async () => {
    const client = getBearerAuthRedisClient();
    if (client.isOpen) {
      await client.quit();
    }
  });

  it("creates a session, stores in Redis, sets HTTP-only cookie, and maintains user index", async () => {
    const { event, setCookies } = createMockEvent({}, { "user-agent": "Mozilla/5.0 Test" });

    const sessionId = await createBearerAuthSession(event, {
      userId: "user_123",
      token: "bearer_token_abc",
      refreshToken: "refresh_token_xyz",
      profile: { id: "user_123", email: "test@example.com", name: "Tester" },
    });

    expect(sessionId).toBeDefined();
    expect(typeof sessionId).toBe("string");

    // 1. Verify Redis session data
    const rawSession = await redis.get(`session:${sessionId}`);
    expect(rawSession).toBeDefined();
    const parsed = JSON.parse(rawSession!);
    expect(parsed.userId).toBe("user_123");
    expect(parsed.token).toBe("bearer_token_abc");
    expect(parsed.refreshToken).toBe("refresh_token_xyz");
    expect(parsed.profile.email).toBe("test@example.com");
    expect(parsed.userAgent).toBe("Mozilla/5.0 Test");

    // 2. Verify Redis TTL
    const ttl = await redis.ttl(`session:${sessionId}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60 * 60 * 24 * 7);

    // 3. Verify user sessions set index
    const userSessions = await redis.sMembers("user_sessions:user_123");
    expect(userSessions).toContain(sessionId);

    // 4. Verify cookie was set
    expect(setCookies.some((c) => c.name === "nuxt_bearer_auth_session_dev" && c.value === sessionId)).toBe(true);
  });

  it("retrieves a valid session via cookie", async () => {
    const { event: createEvent } = createMockEvent();
    const sessionId = await createBearerAuthSession(createEvent, {
      userId: "user_456",
      token: "token_456",
      profile: { id: "user_456", name: "Bob" },
    });

    const { event: getEvent } = createMockEvent({
      nuxt_bearer_auth_session_dev: sessionId,
    });

    const session = await getBearerAuthSession(getEvent);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe("user_456");
    expect(session?.profile?.name).toBe("Bob");
  });

  it("returns null when no session cookie is present", async () => {
    const { event } = createMockEvent({});
    const session = await getBearerAuthSession(event);
    expect(session).toBeNull();
  });

  it("returns null and deletes cookie when session in cookie does not exist in Redis", async () => {
    const { event, setCookies } = createMockEvent({
      nuxt_bearer_auth_session_dev: "non-existent-uuid",
    });

    const session = await getBearerAuthSession(event);
    expect(session).toBeNull();
    expect(setCookies.some((c) => c.name === "nuxt_bearer_auth_session_dev")).toBe(true);
  });

  it("destroys session and deletes cookie if session is expired in Redis payload", async () => {
    const sessionId = "expired-session-id";
    const expiredSession = {
      userId: "user_expired",
      token: "old_token",
      profile: null,
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() - 10000, // expired 10s ago
      lastActivity: new Date().toISOString(),
    };
    await redis.set(`session:${sessionId}`, JSON.stringify(expiredSession));

    const { event } = createMockEvent({
      nuxt_bearer_auth_session_dev: sessionId,
    });

    const session = await getBearerAuthSession(event);
    expect(session).toBeNull();

    const inRedis = await redis.get(`session:${sessionId}`);
    expect(inRedis).toBeNull();
  });

  it("updates an existing session (token, profile, refreshToken)", async () => {
    const { event: createEvent } = createMockEvent();
    const sessionId = await createBearerAuthSession(createEvent, {
      userId: "user_update",
      token: "initial_token",
      refreshToken: "initial_refresh",
      profile: { id: "user_update", name: "Initial" },
    });

    const { event: updateEvent } = createMockEvent({
      nuxt_bearer_auth_session_dev: sessionId,
    });

    const updated = await updateBearerAuthSession(updateEvent, {
      token: "new_rotated_token",
      profile: { id: "user_update", name: "Updated Name" },
    });

    expect(updated).toBe(true);
    expect(updateEvent.context.auth?.token).toBe("new_rotated_token");
    expect(updateEvent.context.auth?.profile?.name).toBe("Updated Name");
    // refreshToken should be preserved if not provided in partial update
    expect(updateEvent.context.auth?.refreshToken).toBe("initial_refresh");

    // Check Redis
    const data = JSON.parse((await redis.get(`session:${sessionId}`))!);
    expect(data.token).toBe("new_rotated_token");
    expect(data.profile.name).toBe("Updated Name");
    expect(data.refreshToken).toBe("initial_refresh");
  });

  it("destroys a single session completely", async () => {
    const { event: createEvent } = createMockEvent();
    const sessionId = await createBearerAuthSession(createEvent, {
      userId: "user_del",
      token: "del_token",
      profile: null,
    });

    const { event: destroyEvent, setCookies } = createMockEvent({
      nuxt_bearer_auth_session_dev: sessionId,
    });

    await destroyBearerAuthSession(destroyEvent);

    expect(await redis.get(`session:${sessionId}`)).toBeNull();
    const remaining = await redis.sMembers("user_sessions:user_del");
    expect(remaining).not.toContain(sessionId);
    expect(setCookies.some((c) => c.name === "nuxt_bearer_auth_session_dev")).toBe(true);
  });

  it("destroys all sessions for a user", async () => {
    const { event: e1 } = createMockEvent();
    const { event: e2 } = createMockEvent();

    const s1 = await createBearerAuthSession(e1, { userId: "user_multi", token: "t1" });
    const s2 = await createBearerAuthSession(e2, { userId: "user_multi", token: "t2" });

    await destroyAllBearerAuthSessions("user_multi");

    expect(await redis.get(`session:${s1}`)).toBeNull();
    expect(await redis.get(`session:${s2}`)).toBeNull();
    expect(await redis.sMembers("user_sessions:user_multi")).toEqual([]);
  });

  it("lists active public sessions for a user", async () => {
    const { event } = createMockEvent({}, { "user-agent": "Device Alpha" });
    const s1 = await createBearerAuthSession(event, {
      userId: "user_list",
      token: "t1",
    });

    const list = await getUserBearerAuthSessions("user_list");
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(s1);
    expect(list[0].userAgent).toBe("Device Alpha");
    // Public session must not expose bearer token or refresh token!
    expect((list[0] as any).token).toBeUndefined();
    expect((list[0] as any).refreshToken).toBeUndefined();
  });

  it("allows user to delete a specific session with authorization check", async () => {
    const { event } = createMockEvent();
    const s1 = await createBearerAuthSession(event, { userId: "user_owner", token: "t1" });

    // Try deleting from wrong user
    await expect(deleteUserBearerAuthSession("wrong_user", s1)).rejects.toThrow("Unauthorized");

    // Delete as owner
    await deleteUserBearerAuthSession("user_owner", s1);
    expect(await redis.get(`session:${s1}`)).toBeNull();
  });

  it("requireBearerAuthSession throws 401 when unauthenticated and returns session when present", () => {
    const eventUnauth: Partial<H3Event> = { context: {} };
    expect(() => requireBearerAuthSession(eventUnauth as H3Event)).toThrow("Unauthenticated");

    const eventAuth: Partial<H3Event> = {
      context: {
        auth: {
          userId: "123",
          token: "tok",
          profile: null,
          createdAt: "",
          expiresAt: 1,
          lastActivity: "",
        },
      },
    };
    const sess = requireBearerAuthSession(eventAuth as H3Event);
    expect(sess.userId).toBe("123");
  });
});
