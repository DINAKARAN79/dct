"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useObjectFields } from "@/hooks/use-object-fields";
import { FilterBuilder } from "./filter-builder";
import type { FilterValue } from "./filter-row";

export type Visibility = "ONLY_ME" | "ALL_USERS" | "SELECTED_USERS";

export function ListViewModal({
  objectName,
  open,
  onOpenChange,
  onSave,
  initialName,
}: {
  objectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (payload: { name: string; apiName: string; visibility: Visibility; filters: FilterValue[] }) => void;
  initialName?: string;
}) {
  const { fields, loading, error } = useObjectFields(objectName);
  const [name, setName] = React.useState(initialName || "");
  const [apiName, setApiName] = React.useState("");
  const [visibility, setVisibility] = React.useState<Visibility>("ONLY_ME");
  const [filters, setFilters] = React.useState<FilterValue[]>([]);

  React.useEffect(() => {
    if (initialName) setName(initialName);
  }, [initialName]);

  React.useEffect(() => {
    if (!name) {
      setApiName("");
      return;
    }
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);
    setApiName(slug || "list_view");
  }, [name]);

  const ownerFields = React.useMemo(
    () => fields.filter((field) => field.key.toLowerCase().includes("owner") || field.key.toLowerCase().includes("assignee") || field.key.toLowerCase().includes("assigned") || field.key.toLowerCase().includes("user")),
    [fields],
  );

  const canSave = Boolean(name.trim()) && filters.every((filter) => {
    const field = fields.find((item) => item.key === filter.field);
    const operatorIsValueFree = ["is_empty", "is_not_empty", "is_true", "is_false"].includes(filter.operator);
    if (!field || !filter.operator) return false;
    if (operatorIsValueFree) return true;
    return Boolean(filter.value && String(filter.value).trim().length > 0);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create List View</DialogTitle>
          <DialogDescription>
            Save a reusable list view for {objectName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-sky-700">List View Name</label>
            <input value={name} onChange={(event) => setName(event.target.value)} className="h-10 w-full rounded-md border border-sky-200 bg-white px-3 text-sm text-slate-700 outline-none ring-0" placeholder="My active deals" />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-sky-700">List View API Name</label>
            <input value={apiName} onChange={(event) => setApiName(event.target.value)} className="h-10 w-full rounded-md border border-sky-200 bg-white px-3 text-sm text-slate-700 outline-none ring-0" placeholder="my_active_deals" />
          </div>

          <fieldset className="space-y-2 rounded-md border border-sky-100 p-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-sky-700">Visibility</legend>
            {(["ONLY_ME", "ALL_USERS", "SELECTED_USERS"] as Visibility[]).map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" checked={visibility === option} onChange={() => setVisibility(option)} />
                {option === "ONLY_ME" ? "Only Me" : option === "ALL_USERS" ? "All Users" : "Selected Users"}
              </label>
            ))}
          </fieldset>

          {ownerFields.length > 0 && (
            <div className="space-y-2 rounded-md border border-sky-100 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Filter By Owner</p>
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <label className="flex items-center gap-2"><input type="radio" name="owner-filter" defaultChecked /> All</label>
                <label className="flex items-center gap-2"><input type="radio" name="owner-filter" /> My</label>
                <label className="flex items-center gap-2"><input type="radio" name="owner-filter" /> Selected Users</label>
              </div>
            </div>
          )}

          {loading ? (
            <div className="rounded-md border border-sky-100 bg-sky-50 p-3 text-sm text-sky-700">Loading fields…</div>
          ) : error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : (
            <FilterBuilder fields={fields.filter((field) => field.isFilterable !== false)} filters={filters} onChange={setFilters} />
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={!canSave} onClick={() => onSave?.({ name, apiName, visibility, filters })} className="bg-sky-700 text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
