"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { FilterRow, type FilterValue } from "./filter-row";
import type { ObjectFieldMetadata } from "@/hooks/use-object-fields";

export function FilterBuilder({
  fields,
  filters,
  onChange,
}: {
  fields: ObjectFieldMetadata[];
  filters: FilterValue[];
  onChange: (next: FilterValue[]) => void;
}) {
  const addFilter = () => {
    const fallbackField = fields.find((field) => field.isFilterable !== false) || fields[0];
    onChange([
      ...filters,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        field: fallbackField?.key || "",
        operator: "equals",
        value: "",
      },
    ]);
  };

  const updateFilter = (id: string, next: FilterValue) => {
    onChange(filters.map((filter) => (filter.id === id ? next : filter)));
  };

  const removeFilter = (id: string) => {
    onChange(filters.filter((filter) => filter.id !== id));
  };

  return (
    <div className="space-y-3 rounded-md border border-sky-100 bg-sky-50/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-sky-700">Filter By Additional Fields</span>
        {filters.length > 0 && (
          <button type="button" className="text-xs font-semibold text-sky-700 underline" onClick={() => onChange([])}>
            Remove All
          </button>
        )}
      </div>

      {filters.length === 0 ? (
        <button type="button" onClick={addFilter} className="inline-flex items-center gap-2 rounded-md border border-dashed border-sky-300 bg-white px-3 py-2 text-sm font-medium text-sky-700">
          <Plus className="h-4 w-4" /> Add Filter
        </button>
      ) : (
        <div className="space-y-2">
          {filters.map((filter) => (
            <FilterRow
              key={filter.id}
              fields={fields}
              value={filter}
              onChange={(next) => updateFilter(filter.id, next)}
              onRemove={() => removeFilter(filter.id)}
            />
          ))}
          <button type="button" onClick={addFilter} className="inline-flex items-center gap-2 rounded-md border border-dashed border-sky-300 bg-white px-3 py-2 text-sm font-medium text-sky-700">
            <Plus className="h-4 w-4" /> Add Filter
          </button>
        </div>
      )}
    </div>
  );
}
