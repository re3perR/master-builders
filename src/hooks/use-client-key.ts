"use client";

import { useCallback, useRef } from "react";

export function useClientKey() {
  const key = useRef<string | null>(null);

  const current = useCallback(() => {
    if (!key.current) key.current = crypto.randomUUID();
    return key.current;
  }, []);

  const reset = useCallback(() => {
    key.current = null;
  }, []);

  return { current, reset };
}
