"use client";

import * as React from "react";
import { X } from "lucide-react";
import type { ObjectFieldMetadata } from "@/hooks/use-object-fields";

export type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal"
  | "is_true"
  | "is_false"
  | "is_empty"
  | "is_not_empty"
  | "in"
  | "not_in"
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "last_n_days"
  | "next_n_days"
  | "between";

export type FilterValue = {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
};

const operatorsByDataType: Record<ObjectFieldMetadata["dataType"], FilterOperator[]> = {
  text: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty"],
  email: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty"],
  phone: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty"],
  number: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between", "is_empty"],
  currency: ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between", "is_empty"],
  boolean: ["is_true", "is_false"],
  date: ["equals", "greater_than", "less_than", "between", "today", "yesterday", "this_week", "this_month", "last_n_days", "next_n_days", "is_empty"],
  datetime: ["equals", "greater_than", "less_than", "between", "today", "yesterday", "this_week", "this_month", "last_n_days", "next_n_days", "is_empty"],
  picklist: ["equals", "not_equals", "in", "not_in", "is_empty"],
  multi_picklist: ["equals", "not_equals", "in", "not_in", "is_empty"],
  lookup: ["equals", "not_equals", "in", "is_empty"],
};

export function getOperatorsForField(field?: ObjectFieldMetadata) {
  if (!field) return [] as FilterOperator[];
  return operatorsByDataType[field.dataType] || ["equals"];
}

const operatorLabels: Record<FilterOperator, string> = {
  equals: "equals",
  not_equals: "not equals",
  contains: "contains",
  not_contains: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
  greater_than: ">",
  greater_than_or_equal: ">=",
  less_than: "<",
  less_than_or_equal: "<=",
  is_true: "is true",
  is_false: "is false",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  in: "in",
  not_in: "not in",
  today: "today",
  yesterday: "yesterday",
  this_week: "this week",
  this_month: "this month",
  last_n_days: "last N days",
  next_n_days: "next N days",
  between: "between",
};

export function FilterRow({
  fields,
  value,
  onChange,
  onRemove,
}: {
  fields: ObjectFieldMetadata[];
  value: FilterValue;
  onChange: (next: FilterValue) => void;
  onRemove: () => void;
}) {
  const selectedField = fields.find((field) => field.key === value.field) || fields[0];
  const options = getOperatorsForField(selectedField);
  const needsValue = !["is_empty", "is_not_empty", "is_true", "is_false"].includes(value.operator);

  return (
    <div className="grid gap-2 md:grid-cols-[1.25fr_1fr_1.5fr_auto]">
      <select
        className="h-9 rounded-md border border-sky-200 bg-white px-2 text-sm text-slate-700"
        value={selectedField?.key || ""}
        onChange={(event) => onChange({ ...value, field: event.target.value, operator: getOperatorsForField(fields.find((field) => field.key === event.target.value))[0] || "equals", value: "" })}
      >
        {fields.map((field) => (
          <option key={field.key} value={field.key}>{field.label}</option>
        ))}
      </select>

      <select
        className="h-9 rounded-md border border-sky-200 bg-white px-2 text-sm text-slate-700"
        value={value.operator}
        onChange={(event) => onChange({ ...value, operator: event.target.value as FilterOperator, value: ["is_empty", "is_not_empty", "is_true", "is_false"].includes(event.target.value as FilterOperator) ? "" : value.value })}
      >
        {options.map((operator) => (
          <option key={operator} value={operator}>{operatorLabels[operator] || operator}</option>
        ))}
      </select>

      {needsValue ? (
        selectedField?.dataType === "picklist" || selectedField?.dataType === "multi_picklist" || !!selectedField?.options ? (
          <select
            className="h-9 rounded-md border border-sky-200 bg-white px-2 text-sm text-slate-700"
            value={value.value}
            onChange={(event) => onChange({ ...value, value: event.target.value })}
          >
            <option value="">Select</option>
            {(selectedField?.options || []).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        ) : (
          <input
            className="h-9 rounded-md border border-sky-200 bg-white px-2 text-sm text-slate-700"
            value={value.value}
            onChange={(event) => onChange({ ...value, value: event.target.value })}
            type={selectedField?.dataType === "number" || selectedField?.dataType === "currency" ? "number" : selectedField?.dataType === "date" || selectedField?.dataType === "datetime" ? "date" : "text"}
            placeholder={selectedField?.dataType === "date" || selectedField?.dataType === "datetime" ? "Pick a date" : "Value"}
          />
        )
      ) : (
        <div className="flex h-9 items-center rounded-md border border-dashed border-sky-200 bg-sky-50 px-2 text-xs text-slate-500">
          No value
        </div>
      )}

      <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-sky-200 bg-white text-slate-600 hover:bg-sky-50" onClick={onRemove} aria-label="Remove filter">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
