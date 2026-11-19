import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  listUsers: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  userApi: { list: testState.listUsers },
}));

vi.mock("@/components/crm/logged-in-badge", () => ({
  LoggedInBadge: () => null,
}));

import { UserLookup } from "@/components/crm/user-lookup";

describe("UserLookup", () => {
  it("shows user options as an overlay and closes after selection", () => {
    const onChange = vi.fn();
    render(
      <UserLookup
        id="owner"
        ariaLabel="Owner"
        users={[{ id: "user-1", firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", isActive: true }]}
        value=""
        onChange={onChange}
      />,
    );

    fireEvent.focus(screen.getByRole("combobox", { name: "Owner" }));
    const listbox = screen.getByRole("listbox");
    expect(listbox.className).toContain("z-[60]");
    expect(document.body).toContainElement(listbox);
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) expect(dialog).not.toContainElement(listbox);

    fireEvent.click(screen.getByRole("option", { name: /Ada Lovelace/ }));

    expect(onChange).toHaveBeenCalledWith("user-1");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens the lookup from the search button and stays open after input blur", () => {
    render(
      <UserLookup
        id="search-button"
        ariaLabel="New Owner"
        users={[{ id: "user-1", firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", isActive: true }]}
        value=""
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByRole("combobox", { name: "New Owner" });
    fireEvent.click(screen.getByRole("button", { name: "Search New Owner" }));

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(input).toHaveFocus();

    fireEvent.blur(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.pointerDown(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("keeps the Lead owner list hidden on focus until the search button is clicked", () => {
    render(
      <UserLookup
        id="lead-owner-search"
        ariaLabel="New Owner"
        users={[{ id: "user-1", firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", isActive: true }]}
        value=""
        onChange={vi.fn()}
        localSearch
        compact
        openOnFocus={false}
      />,
    );

    const input = screen.getByRole("combobox", { name: "New Owner" });
    fireEvent.focus(input);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Search New Owner" }));
    expect(screen.getByRole("option", { name: /Ada Lovelace/ })).toBeInTheDocument();
  });

  it("keeps Sales Test3 search results open when the search icon is clicked", () => {
    render(
      <UserLookup
        id="sales-owner"
        ariaLabel="New Owner"
        users={[{ id: "sales-test-3", firstName: "Sales", lastName: "Test3", email: "sales.test3@example.com", isActive: true }]}
        value=""
        onChange={vi.fn()}
        localSearch
        compact
      />,
    );

    const input = screen.getByRole("combobox", { name: "New Owner" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Sales Test3" } });
    expect(screen.getByRole("option", { name: /Sales Test3/ })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Search New Owner" }));
    expect(screen.getByRole("option", { name: /Sales Test3/ })).toBeInTheDocument();
  });

  it("shows a compact owner list without the generic recent-items heading", () => {
    render(
      <UserLookup
        id="compact-owner"
        ariaLabel="New Owner"
        users={[{ id: "user-1", firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", profile: { name: "Sales" }, isActive: true }]}
        value=""
        onChange={vi.fn()}
        localSearch
        compact
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Search New Owner" }));

    expect(screen.getByRole("option", { name: /Ada Lovelace/ })).toBeInTheDocument();
    expect(screen.queryByText("Sales")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent Items")).not.toBeInTheDocument();
  });

  it("shows email and profile details in the full owner picker", () => {
    render(
      <UserLookup
        id="full-owner"
        ariaLabel="New Owner"
        users={[{ id: "user-1", firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", profile: { name: "Sales" }, isActive: true }]}
        value=""
        onChange={vi.fn()}
        localSearch
      />,
    );

    fireEvent.focus(screen.getByRole("combobox", { name: "New Owner" }));

    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("Sales")).toBeInTheDocument();
  });

  it("can show only a user's name in the full-size results", () => {
    render(
      <UserLookup
        id="name-only-owner"
        ariaLabel="User"
        users={[{ id: "user-1", firstName: "CRM", lastName: "Test1", email: "crm.test1@example.com", profile: { name: "CRM" }, isActive: true }]}
        value=""
        onChange={vi.fn()}
        localSearch
        showDetails={false}
      />,
    );

    fireEvent.focus(screen.getByRole("combobox", { name: "User" }));

    expect(screen.getByRole("option", { name: /CRM Test1/ })).toBeInTheDocument();
    expect(screen.queryByText("crm.test1@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("CRM", { selector: "span" })).not.toBeInTheDocument();
  });

  it("filters eligible users locally when remote search is disabled", () => {
    render(
      <UserLookup
        id="eligible-owner"
        ariaLabel="New Owner"
        users={[
          { id: "user-1", firstName: "Taylor", lastName: "User", email: "taylor@example.com", profile: { name: "Presales" }, isActive: true },
          { id: "user-2", firstName: "Grace", lastName: "Hopper", email: "grace@example.com", isActive: true },
        ]}
        value=""
        onChange={vi.fn()}
        localSearch
      />,
    );

    fireEvent.focus(screen.getByRole("combobox", { name: "New Owner" }));
    fireEvent.change(screen.getByRole("combobox", { name: "New Owner" }), { target: { value: "presales" } });

    expect(screen.getByRole("option", { name: /Taylor User/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Grace Hopper/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Show more results/)).not.toBeInTheDocument();
    expect(testState.listUsers).not.toHaveBeenCalled();
  });

  it("keeps at least three matching users visible in the search list", () => {
    render(
      <UserLookup
        id="three-results"
        ariaLabel="New Owner"
        users={[
          { id: "user-1", firstName: "Alex", lastName: "One", email: "alex1@example.com", isActive: true },
          { id: "user-2", firstName: "Alex", lastName: "Two", email: "alex2@example.com", isActive: true },
          { id: "user-3", firstName: "Alex", lastName: "Three", email: "alex3@example.com", isActive: true },
          { id: "user-4", firstName: "Alex", lastName: "Four", email: "alex4@example.com", isActive: true },
        ]}
        value=""
        onChange={vi.fn()}
        localSearch
      />,
    );

    fireEvent.focus(screen.getByRole("combobox", { name: "New Owner" }));
    fireEvent.change(screen.getByRole("combobox", { name: "New Owner" }), { target: { value: "alex" } });

    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(screen.getByText("4 matches. Scroll to see all users.")).toBeInTheDocument();
    expect(screen.getByRole("listbox").className).toContain("min-h-[min(15rem,50vh)]");
  });

  it("matches every word across a user's name and profile", () => {
    render(
      <UserLookup
        id="multiword-search"
        ariaLabel="New Owner"
        users={[
          { id: "user-1", firstName: "Taylor", lastName: "User", email: "taylor@example.com", profile: { name: "Sales Executive" }, isActive: true },
          { id: "user-2", firstName: "Grace", lastName: "Hopper", email: "grace@example.com", profile: { name: "Presales" }, isActive: true },
        ]}
        value=""
        onChange={vi.fn()}
        localSearch
      />,
    );

    fireEvent.focus(screen.getByRole("combobox", { name: "New Owner" }));
    fireEvent.change(screen.getByRole("combobox", { name: "New Owner" }), { target: { value: "user sales" } });

    expect(screen.getByRole("option", { name: /Taylor User/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Grace Hopper/ })).not.toBeInTheDocument();
  });

  it("shows owner eligibility guidance when no users match", () => {
    render(
      <UserLookup
        id="empty-owner"
        ariaLabel="New Owner"
        users={[]}
        value=""
        onChange={vi.fn()}
        localSearch
        emptyMessage="No eligible users match."
      />,
    );

    fireEvent.focus(screen.getByRole("combobox", { name: "New Owner" }));
    fireEvent.change(screen.getByRole("combobox", { name: "New Owner" }), { target: { value: "sales user" } });

    expect(screen.getByText("No eligible users match.")).toBeInTheDocument();
  });
});
