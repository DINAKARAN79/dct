"use client";

import * as React from "react";

export type ObjectFieldMetadata = {
  key: string;
  label: string;
  dataType: "text" | "number" | "currency" | "boolean" | "date" | "datetime" | "picklist" | "multi_picklist" | "lookup" | "email" | "phone";
  options?: Array<{ value: string; label: string }>;
  lookupObject?: string;
  isFilterable?: boolean;
};

export function useObjectFields(objectName?: string | null) {
  const [fields, setFields] = React.useState<ObjectFieldMetadata[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!objectName) {
      setFields([]);
      setLoading(false);
      setError(null);
      return;
    }

    const objectKey = objectName;
    let isMounted = true;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/proxy/api/metadata/${encodeURIComponent(objectKey)}/fields`, {
          method: "GET",
          signal: controller.signal,
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }

        const payload = (await response.json()) as { success?: boolean; data?: ObjectFieldMetadata[]; error?: string };
        if (!isMounted) return;
        setFields(Array.isArray(payload.data) ? payload.data : []);
        setError(payload.error ?? null);
      } catch (caughtError) {
        if (controller.signal.aborted) return;
        if (!isMounted) return;
        setFields([]);
        setError(caughtError instanceof Error ? caughtError.message : "Unable to load fields");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void load();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [objectName]);

  return { fields, loading, error };
}
