const INVALIDATION_TYPE = "nuxt-bearer-auth:session-invalidated";
const STORAGE_VALUE = "invalidated";

function storageKey(channelName: string) {
  return `${channelName}:session-invalidation`;
}

export function broadcastBearerAuthSessionInvalidation(channelName: string) {
  if (import.meta.server) return;

  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(channelName);
      channel.postMessage({ type: INVALIDATION_TYPE });
      channel.close();
      return;
    } catch {
      // Fall through to the storage-event fallback.
    }
  }

  try {
    if (typeof localStorage !== "undefined") {
      const key = storageKey(channelName);
      localStorage.setItem(key, STORAGE_VALUE);
      localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts.
  }
}

export function listenForBearerAuthSessionInvalidation(
  channelName: string,
  callback: () => void,
) {
  if (import.meta.server) return () => undefined;

  let channel: BroadcastChannel | undefined;
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === storageKey(channelName) &&
      event.newValue === STORAGE_VALUE
    ) {
      callback();
    }
  };

  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(channelName);
      channel.addEventListener("message", (event: MessageEvent) => {
        if (
          event.data &&
          typeof event.data === "object" &&
          event.data.type === INVALIDATION_TYPE
        ) {
          callback();
        }
      });
    } catch {
      channel = undefined;
    }
  }

  if (!channel && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    channel?.close();
    if (!channel && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}
