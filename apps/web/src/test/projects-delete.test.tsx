import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  deleteProject: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ hasEffectivePermission: () => true }),
}));

vi.mock("@/components/crm/list-view-control", () => ({
  useListView: () => ({
    ready: true,
    params: {},
    queryKey: "",
    control: null,
    dialog: null,
    sorting: null,
    onSortingChange: vi.fn(),
  }),
}));

vi.mock("@/components/crm/list-page-header", () => ({
  ListPageHeader: () => null,
  listPageActionClassName: "",
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/lib/api", () => ({
  projectApi: {
    list: mocks.listProjects,
    delete: mocks.deleteProject,
    create: vi.fn(),
  },
}));

import ProjectsPage from "@/app/(dashboard)/projects/page";

describe("Projects page delete action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listProjects.mockResolvedValue({
      data: {
        success: true,
        data: [{
          id: "project-1",
          name: "Alpha Project",
          address: "Main Road",
          city: "Chennai",
          state: "Tamil Nadu",
          latitude: null,
          longitude: null,
          status: "PLANNING",
          totalUnits: 0,
          soldUnits: 0,
          completionPercentage: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
        }],
        pagination: { total: 1 },
      },
    });
    mocks.deleteProject.mockResolvedValue({ data: { success: true, data: null } });
  });

  it("confirms deletion, calls the project API, and removes the project from the list", async () => {
    render(<ProjectsPage />);

    fireEvent.pointerDown(await screen.findByRole("button", { name: "Actions for Alpha Project" }), {
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));

    await waitFor(() => expect(mocks.deleteProject).toHaveBeenCalledWith("project-1"));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Alpha Project" })).not.toBeInTheDocument());
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Project deleted" }));
  });

});
