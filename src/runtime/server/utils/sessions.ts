import crypto from "node:crypto";
import { createClient } from "redis";
import {
  createError,
  deleteCookie,
  getCookie,
  getHeaders,
  getRequestIP,
  setCookie,
  type H3Event,
} from "h3";
import {
  getBearerAuthConfig,
  getSessionCookieName,
  isProductionRuntime,
} from "./config";
import type {
  BearerAuthSession,
  BearerAuthUser,
  PublicSession,
} from "../../types/auth";

const SESSION_PREFIX = "session:";
const USER_SESSIONS_PREFIX = "user_sessions:";

const globalForRedis = globalThis as unknown as {
  __nuxtBearerAuthRedis?: ReturnType<typeof createClient>;
};

export function getBearerAuthRedisClient() {
  if (!globalForRedis.__nuxtBearerAuthRedis) {
    const config = getBearerAuthConfig();
    const client = createClient({
      url: config.redisUrl || process.env.REDIS_URL || "redis://127.0.0.1:6379",
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
        connectTimeout: 10000,
      },
    });

    client.on("error", (error) => {
      console.error("[nuxt-bearer-auth] Redis error:", error);
    });

    globalForRedis.__nuxtBearerAuthRedis = client;
  }

  return globalForRedis.__nuxtBearerAuthRedis;
}

export async function ensureBearerAuthRedisConnection() {
  const redis = getBearerAuthRedisClient();

  if (!redis.isOpen && !redis.isReady) {
    await redis.connect();
  }

  return redis;
}

function getSessionDuration() {
  return getBearerAuthConfig().sessionCookie.maxAge;
}

function getCookieOptions() {
  const config = getBearerAuthConfig();
  const cookie = config.sessionCookie;

  return {
    httpOnly: true,
    sameSite: cookie.sameSite,
    secure: cookie.secure ?? isProductionRuntime(),
    domain: cookie.domain,
    path: cookie.path || "/",
    maxAge: cookie.maxAge,
  };
}

export async function createBearerAuthSession<User extends BearerAuthUser>(
  event: H3Event,
  input: {
    userId: string;
    token: string;
    refreshToken?: string | null;
    profile?: User | null;
    abilities?: string[] | null;
  },
) {
  const redis = await ensureBearerAuthRedisConnection();
  const sessionId = crypto.randomUUID();
  const headers = getHeaders(event);
  const now = new Date().toISOString();
  const duration = getSessionDuration();

  const session: BearerAuthSession<User> = {
    userId: input.userId,
    token: input.token,
    refreshToken: input.refreshToken || null,
    profile: input.profile || null,
    abilities: input.abilities || null,
    createdAt: now,
    expiresAt: Date.now() + duration * 1000,
    lastActivity: now,
    userAgent: headers["user-agent"],
    ipAddress: getRequestIP(event, { xForwardedFor: true }),
  };

  const multi = redis.multi();
  multi.setEx(
    `${SESSION_PREFIX}${sessionId}`,
    duration,
    JSON.stringify(session),
  );
  multi.sAdd(`${USER_SESSIONS_PREFIX}${input.userId}`, sessionId);
  multi.expire(`${USER_SESSIONS_PREFIX}${input.userId}`, duration);
  await multi.exec();

  setCookie(event, getSessionCookieName(), sessionId, getCookieOptions());

  return sessionId;
}

export async function updateBearerAuthSession<User extends BearerAuthUser>(
  event: H3Event,
  updates: Partial<
    Pick<
      BearerAuthSession<User>,
      "token" | "refreshToken" | "profile" | "abilities"
    >
  >,
) {
  const sessionId = getBearerAuthSessionCookie(event);
  if (!sessionId) return false;

  const redis = await ensureBearerAuthRedisConnection();
  const key = `${SESSION_PREFIX}${sessionId}`;
  const data = await redis.get(key);
  if (!data) return false;

  const existing = JSON.parse(data) as BearerAuthSession<User>;

  if (Date.now() > existing.expiresAt) {
    await destroyBearerAuthSession(event);
    return false;
  }

  const duration = getSessionDuration();
  const session: BearerAuthSession<User> = {
    ...existing,
    ...updates,
    expiresAt: Date.now() + duration * 1000,
    lastActivity: new Date().toISOString(),
  };

  await redis.setEx(key, duration, JSON.stringify(session));
  event.context.auth = session;

  return true;
}

export async function getBearerAuthSession<User extends BearerAuthUser>(
  event: H3Event,
): Promise<BearerAuthSession<User> | null> {
  const sessionId = getBearerAuthSessionCookie(event);
  if (!sessionId) return null;

  const redis = await ensureBearerAuthRedisConnection();
  const key = `${SESSION_PREFIX}${sessionId}`;
  const data = await redis.get(key);

  if (!data) {
    deleteCookie(event, getSessionCookieName(), { path: "/" });
    return null;
  }

  const session = JSON.parse(data) as BearerAuthSession<User>;

  if (Date.now() > session.expiresAt) {
    await destroyBearerAuthSession(event);
    return null;
  }

  updateSessionActivity(sessionId, session).catch(() => undefined);
  return session;
}

async function updateSessionActivity(
  sessionId: string,
  session: BearerAuthSession,
) {
  const redis = await ensureBearerAuthRedisConnection();
  const duration = getSessionDuration();
  const updatedSession: BearerAuthSession = {
    ...session,
    expiresAt: Date.now() + duration * 1000,
    lastActivity: new Date().toISOString(),
  };

  await redis.setEx(
    `${SESSION_PREFIX}${sessionId}`,
    duration,
    JSON.stringify(updatedSession),
  );
}

export async function destroyBearerAuthSession(event: H3Event) {
  const sessionId = getBearerAuthSessionCookie(event);

  if (!sessionId) {
    deleteCookie(event, getSessionCookieName(), { path: "/" });
    return;
  }

  const redis = await ensureBearerAuthRedisConnection();
  const key = `${SESSION_PREFIX}${sessionId}`;
  const data = await redis.get(key);

  if (data) {
    const session = JSON.parse(data) as BearerAuthSession;
    await redis.sRem(`${USER_SESSIONS_PREFIX}${session.userId}`, sessionId);
  }

  await redis.del(key);
  deleteCookie(event, getSessionCookieName(), { path: "/" });
}

export async function destroyAllBearerAuthSessions(userId: string) {
  const redis = await ensureBearerAuthRedisConnection();
  const key = `${USER_SESSIONS_PREFIX}${userId}`;
  const sessionIds = await redis.sMembers(key);

  if (!sessionIds.length) return;

  const multi = redis.multi();
  for (const sessionId of sessionIds) {
    multi.del(`${SESSION_PREFIX}${sessionId}`);
  }
  multi.del(key);
  await multi.exec();
}

export async function getUserBearerAuthSessions(
  userId: string,
): Promise<PublicSession[]> {
  const redis = await ensureBearerAuthRedisConnection();
  const sessionIds = await redis.sMembers(`${USER_SESSIONS_PREFIX}${userId}`);
  const sessions: PublicSession[] = [];

  for (const sessionId of sessionIds) {
    const data = await redis.get(`${SESSION_PREFIX}${sessionId}`);
    if (!data) continue;

    const session = JSON.parse(data) as BearerAuthSession;
    sessions.push({
      id: sessionId,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
    });
  }

  return sessions.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

export async function deleteUserBearerAuthSession(
  userId: string,
  sessionId: string,
) {
  const redis = await ensureBearerAuthRedisConnection();
  const key = `${SESSION_PREFIX}${sessionId}`;
  const data = await redis.get(key);

  if (!data) {
    throw createError({ statusCode: 404, statusMessage: "Session not found" });
  }

  const session = JSON.parse(data) as BearerAuthSession;

  if (session.userId !== userId) {
    throw createError({ statusCode: 403, statusMessage: "Unauthorized" });
  }

  await redis.del(key);
  await redis.sRem(`${USER_SESSIONS_PREFIX}${userId}`, sessionId);
}

export function getBearerAuthSessionCookie(event: H3Event) {
  return getCookie(event, getSessionCookieName()) || null;
}

export function requireBearerAuthSession(event: H3Event) {
  const session = event.context.auth as BearerAuthSession | null | undefined;

  if (!session?.userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthenticated" });
  }

  return session;
}
