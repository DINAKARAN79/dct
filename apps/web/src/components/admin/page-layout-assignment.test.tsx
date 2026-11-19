import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  default: { get: mocks.get, put: mocks.put },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

import PageLayoutAssignment from "./page-layout-assignment";

describe("PageLayoutAssignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows selected profiles to save the chosen layout even when it matches the current default", async () => {
    mocks.get.mockResolvedValue({
      data: {
        data: {
          objectName: "Lead",
          recordTypes: [{ key: "MASTER", label: "Master" }],
          profiles: [{ id: "profile-1", name: "Admin" }],
          layouts: [{ id: "default-layout", name: "presales", isDefault: true }],
          defaultLayoutId: "default-layout",
          assignments: [],
        },
      },
    });
    mocks.put.mockResolvedValue({ data: { success: true } });

    render(<PageLayoutAssignment objectName="Lead" onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit Assignment" }));
    fireEvent.click(screen.getByLabelText("Select Admin"));

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mocks.put).toHaveBeenCalledWith("/api/layout-assignments", {
        object: "Lead",
        assignments: [{ profileId: "profile-1", recordTypeKey: "MASTER", layoutId: "default-layout" }],
      });
    });
  });
});
