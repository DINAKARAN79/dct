import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  idleTimeoutSeconds: 600,
  lastActivity: 0,
  me: vi.fn(),
  heartbeat: vi.fn(),
  logout: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  SESSION_IDLE_TIMEOUT_MS: 120_000,
  authApi: {
    me: (...args: unknown[]) => state.me(...args),
    heartbeat: (...args: unknown[]) => state.heartbeat(...args),
    logout: (...args: unknown[]) => state.logout(...args),
  },
  clearSessionToken: vi.fn(),
  getSessionLastActivity: () => state.lastActivity,
  getSessionToken: () => "session-token",
  getSessionTokenExpiry: () => Date.now() + 60 * 60 * 1000,
  impersonationApi: { exit: vi.fn() },
  impersonationMeta: () => null,
  recordSessionActivity: vi.fn(),
  redirectToLoginAfterSessionExpiry: () => state.redirect(),
  refreshSessionToken: vi.fn(),
  leadApi: { statuses: vi.fn(async () => ({ data: { data: [] } })) },
}));

vi.mock("@/lib/date-format", () => ({ setTenantTimezone: vi.fn() }));

import { AuthProvider } from "./auth-context";

describe("session idle timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T08:00:00.000Z"));
    state.idleTimeoutSeconds = 600;
    state.lastActivity = Date.now();
    state.me.mockResolvedValue({
      data: {
        success: true,
        data: {
          idleTimeoutSeconds: state.idleTimeoutSeconds,
          user: { id: "user-1", email: "user@example.test", firstName: "Test", lastName: "User" },
          profile: null,
          roles: [],
          permissions: {},
          effectivePermissions: [],
          effectivePermissionsByModule: {},
          hasFullAccess: false,
          tenant: { id: "tenant-1", name: "Test Tenant", slug: "test-tenant" },
        },
      },
    });
    state.heartbeat.mockImplementation(async () => ({
      data: { data: { nextInMs: 30_000, idleTimeoutSeconds: state.idleTimeoutSeconds } },
    }));
    state.logout.mockResolvedValue({ data: { success: true } });
    state.redirect.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("signs out after the configured 10-minute idle timeout", async () => {
    const view = render(<AuthProvider><div>CRM</div></AuthProvider>);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(state.heartbeat).toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(599_999);
    });
    expect(state.logout).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
    });
    expect(state.logout).toHaveBeenCalledTimes(1);
    expect(state.redirect).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
