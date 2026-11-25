// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  broadcastBearerAuthSessionInvalidation,
  listenForBearerAuthSessionInvalidation,
} from "../src/runtime/utils/session-sync";

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  listeners = new Set<(event: MessageEvent) => void>();
  sent: unknown[] = [];
  closed = false;
  constructor(public name: string) {
    FakeBroadcastChannel.instances.push(this);
  }
  addEventListener(_type: string, listener: (event: MessageEvent) => void) {
    this.listeners.add(listener);
  }
  postMessage(data: unknown) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  emit(data: unknown) {
    for (const listener of this.listeners) listener({ data } as MessageEvent);
  }
}

const originalBroadcastChannel = globalThis.BroadcastChannel;

afterEach(() => {
  FakeBroadcastChannel.instances = [];
  if (originalBroadcastChannel) {
    globalThis.BroadcastChannel = originalBroadcastChannel;
  } else {
    // @ts-expect-error test environment may not implement BroadcastChannel
    delete globalThis.BroadcastChannel;
  }
  localStorage.clear();
});

describe("cross-tab session invalidation", () => {
  it("broadcasts only a fixed invalidation discriminator", () => {
    // @ts-expect-error replacing browser primitive for the test
    globalThis.BroadcastChannel = FakeBroadcastChannel;
    broadcastBearerAuthSessionInvalidation("test-auth");

    const channel = FakeBroadcastChannel.instances[0];
    expect(channel.sent).toEqual([
      { type: "nuxt-bearer-auth:session-invalidated" },
    ]);
    expect(JSON.stringify(channel.sent)).not.toMatch(
      /token|cookie|sessionId|userId|profile/i,
    );
    expect(channel.closed).toBe(true);
  });

  it("handles remote invalidation once and closes the listener", () => {
    // @ts-expect-error replacing browser primitive for the test
    globalThis.BroadcastChannel = FakeBroadcastChannel;
    const callback = vi.fn();
    const stop = listenForBearerAuthSessionInvalidation("test-auth", callback);
    const listener = FakeBroadcastChannel.instances[0];

    listener.emit({ type: "unrelated" });
    listener.emit({ type: "nuxt-bearer-auth:session-invalidated" });
    expect(callback).toHaveBeenCalledTimes(1);

    stop();
    expect(listener.closed).toBe(true);
  });

  it("uses the storage-event fallback when BroadcastChannel is unavailable", () => {
    // @ts-expect-error removing browser primitive for the test
    delete globalThis.BroadcastChannel;
    const callback = vi.fn();
    const stop = listenForBearerAuthSessionInvalidation("fallback-auth", callback);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "fallback-auth:session-invalidation",
        newValue: "invalidated",
      }),
    );
    expect(callback).toHaveBeenCalledTimes(1);

    stop();
  });
});
