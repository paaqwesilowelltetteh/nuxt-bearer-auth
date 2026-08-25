// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { renderToString } from "vue/server-renderer";

const state = vi.hoisted(() => new Map<string, unknown>());
const fetchMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());

// State holders must be genuine Vue refs so component computeds react to
// login/logout/refresh updates. Plain { value } seeds written by tests are
// normalized into real refs on first useState() access, mirroring useState.
vi.mock("#app", async () => {
  const { isRef, ref: vueRef } = await import("vue");
  return {
    navigateTo: navigateMock,
    useNuxtApp: vi.fn(),
    useRuntimeConfig: () => ({
      public: {
        bearerAuth: {
          redirects: {
            login: "/login",
            authenticated: "/dashboard",
            logout: "/",
            unauthorized: "/unauthorized",
          },
          routes: { localApiPrefix: "/api/auth" },
          authorizationEnabled: true,
        },
      },
    }),
    useState: (key: string, factory: () => unknown) => {
      const existing = state.get(key);
      if (!existing) {
        const created = vueRef(factory());
        state.set(key, created);
        return created;
      }
      if (!isRef(existing)) {
        const seeded = (existing as { value?: unknown }).value;
        const wrapped =
          seeded === undefined ? vueRef(factory()) : vueRef(seeded);
        state.set(key, wrapped);
        return wrapped;
      }
      return existing;
    },
  };
});

vi.mock("ofetch", () => ({ $fetch: fetchMock }));

import Can from "../src/runtime/components/Can.vue";
import Cannot from "../src/runtime/components/Cannot.vue";
import { useBearerAuth } from "../src/runtime/composables/useBearerAuth";

const slots = {
  default: () => h("span", { class: "granted" }, "granted-content"),
  fallback: () => h("span", { class: "denied" }, "fallback-content"),
};

function mountCan(props: Record<string, unknown>) {
  return mount(Can as never, { props, slots });
}

function mountCannot(props: Record<string, unknown>) {
  return mount(Cannot as never, { props, slots });
}

describe("<Can> / <Cannot> UI authorization primitives", () => {
  beforeEach(() => {
    state.clear();
    fetchMock.mockReset();
    navigateMock.mockReset();
  });

  it("<Can> renders default slot when the single ability is held", () => {
    state.set("bearer-auth-abilities", { value: ["users.delete"] });
    expect(mountCan({ ability: "users.delete" }).html()).toContain(
      "granted-content",
    );
  });

  it("<Can> renders nothing when the ability is missing and no fallback exists", () => {
    state.set("bearer-auth-abilities", { value: ["users.view"] });
    const wrapper = mount(Can as never, {
      props: { ability: "users.delete" },
      slots: { default: slots.default },
    });
    expect(wrapper.html()).not.toContain("granted-content");
  });

  it("<Can> renders the fallback slot when unauthorized", () => {
    state.set("bearer-auth-abilities", { value: null });
    const wrapper = mountCan({ ability: "users.delete" });
    expect(wrapper.html()).toContain("fallback-content");
    expect(wrapper.html()).not.toContain("granted-content");
  });

  it("all mode requires every listed ability (the default)", () => {
    state.set("bearer-auth-abilities", { value: ["users.view"] });
    expect(
      mountCan({ abilities: ["users.view", "users.edit"] }).html(),
    ).not.toContain("granted-content");

    state.get("bearer-auth-abilities")!.value = ["users.view", "users.edit"];
    expect(
      mountCan({ abilities: ["users.view", "users.edit"] }).html(),
    ).toContain("granted-content");
  });

  it("any mode authorizes when at least one ability is held", () => {
    state.set("bearer-auth-abilities", { value: ["reports.export"] });
    expect(
      mountCan({
        abilities: ["reports.view", "reports.export"],
        mode: "any",
      }).html(),
    ).toContain("granted-content");
    expect(
      mountCannot({
        abilities: ["reports.view", "reports.export"],
        mode: "any",
      }).html(),
    ).toContain("fallback-content");
  });

  it("treats an explicit empty requirements array as unrestricted", () => {
    state.set("bearer-auth-abilities", { value: null });
    expect(mountCan({ abilities: [] }).html()).toContain("granted-content");
  });

  it("treats absent props as unrestricted", () => {
    state.set("bearer-auth-abilities", { value: null });
    expect(mountCan({}).html()).toContain("granted-content");
  });

  it("fails closed when the abilities prop is malformed", () => {
    state.set("bearer-auth-abilities", { value: ["users.view"] });
    const wrapper = mountCan({
      abilities: "users.view" as unknown as string[],
    });
    expect(wrapper.html()).not.toContain("granted-content");
    expect(wrapper.html()).toContain("fallback-content");
  });

  it("fails closed on malformed client authorization state", () => {
    // Wrong-type state mirrors corrupted payloads; must deny, never throw.
    state.set("bearer-auth-abilities", { value: "users.view" });
    expect(mountCan({ ability: "users.view" }).html()).toContain(
      "fallback-content",
    );
    state.get("bearer-auth-abilities")!.value = { ability: "users.view" };
    expect(mountCan({ ability: "users.view" }).html()).toContain(
      "fallback-content",
    );
  });

  it("rejects wildcards through the component surface", () => {
    state.set("bearer-auth-abilities", { value: ["users.delete"] });
    const wrapper = mountCan({ ability: "users.*" });
    expect(wrapper.html()).not.toContain("granted-content");
    expect(wrapper.html()).toContain("fallback-content");
  });

  it("gives the ability prop precedence over abilities", () => {
    state.set("bearer-auth-abilities", { value: ["users.delete"] });
    const wrapper = mountCan({
      ability: "users.delete",
      abilities: ["unrelated.thing"],
    });
    expect(wrapper.html()).toContain("granted-content");
  });

  it("<Cannot> is the exact inverse of <Can>", () => {
    state.set("bearer-auth-abilities", { value: [] });
    // No usable state -> cannot -> default content.
    expect(mountCannot({ ability: "users.delete" }).html()).toContain(
      "granted-content",
    );

    state.get("bearer-auth-abilities")!.value = ["users.delete"];
    const wrapper = mountCannot({ ability: "users.delete" });
    expect(wrapper.html()).not.toContain("granted-content");
    expect(wrapper.html()).toContain("fallback-content");
  });

  it("reacts to login by revealing authorized content", async () => {
    state.set("bearer-auth-abilities", { value: null });
    const auth = useBearerAuth();
    const wrapper = mountCan({ ability: "campaign.create" });
    expect(wrapper.html()).toContain("fallback-content");

    auth.setAbilities(["campaign.create"]);
    await nextTick();
    expect(wrapper.html()).toContain("granted-content");
    expect(wrapper.html()).not.toContain("fallback-content");
  });

  it("reacts to logout by hiding authorized content", async () => {
    state.set("bearer-auth-abilities", { value: ["campaign.create"] });
    const auth = useBearerAuth();
    const wrapper = mountCan({ ability: "campaign.create" });
    expect(wrapper.html()).toContain("granted-content");

    auth.clearAuthState();
    await nextTick();
    expect(wrapper.html()).toContain("fallback-content");
    expect(auth.can("campaign.create")).toBe(false);
  });

  it("reacts to refresh replacing the ability list", async () => {
    state.set("bearer-auth-abilities", { value: ["old.report"] });
    const auth = useBearerAuth();
    const wrapper = mountCan({ ability: "old.report" });
    expect(wrapper.html()).toContain("granted-content");

    auth.setAbilities(["new.report"]);
    await nextTick();
    expect(wrapper.html()).not.toContain("granted-content");

    const wrapperNew = mountCan({ ability: "new.report" });
    expect(wrapperNew.html()).toContain("granted-content");
  });

  it("renders identically across repeated SSR passes (deterministic)", async () => {
    state.set("bearer-auth-abilities", { value: ["users.view"] });

    const vnode = () => h(Can as never, { abilities: ["users.view"] }, slots);
    const first = await renderToString(vnode() as never);
    const second = await renderToString(vnode() as never);

    expect(first).toBe(second);
    expect(first).toContain("granted-content");
    expect(first).not.toContain("fallback-content");
  });

  it("renders the fallback during SSR when unauthorized (fail closed)", async () => {
    state.set("bearer-auth-abilities", { value: null });
    const output = await renderToString(
      h(Can as never, { ability: "users.delete" }, slots) as never,
    );
    expect(output).toContain("fallback-content");
    expect(output).not.toContain("granted-content");
  });
});
