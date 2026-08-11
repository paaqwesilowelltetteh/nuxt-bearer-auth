import {
  ensureBearerAuthRedisConnection,
  getBearerAuthRedisClient,
} from "../utils/sessions";
import { isProductionRuntime } from "../utils/config";

export default defineNitroPlugin(async () => {
  try {
    await ensureBearerAuthRedisConnection();
  } catch (error) {
    console.error("[nuxt-bearer-auth] Redis connection failed:", error);
  }

  if (isProductionRuntime()) {
    const cleanup = async () => {
      try {
        await getBearerAuthRedisClient().quit();
      } catch (error) {
        console.error("[nuxt-bearer-auth] Redis cleanup failed:", error);
      }
    };

    process.once("SIGTERM", cleanup);
    process.once("SIGINT", cleanup);
  }
});
