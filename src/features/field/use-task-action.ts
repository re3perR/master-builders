"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useClientKey } from "@/hooks/use-client-key";
import { connectionLost, type AppError } from "@/lib/errors";
import type { ActionResult } from "@/lib/rpc";

export function useTaskAction() {
  const router = useRouter();
  const clientKey = useClientKey();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<AppError | null>(null);

  function run<T>(action: (key: string) => Promise<ActionResult<T>>, onSuccess?: (data: T) => void) {
    setError(null);
    startTransition(async () => {
      let result: ActionResult<T>;
      try {
        result = await action(clientKey.current());
      } catch {
        setError(connectionLost);
        return;
      }
      if (result.ok) {
        clientKey.reset();
        onSuccess?.(result.data);
        router.refresh();
        return;
      }
      setError(result.error);
      if (result.error.kind === "conflict" || result.error.kind === "state" || result.error.kind === "not_found") {
        router.refresh();
      }
    });
  }

  return { run, pending, error, clearError: () => setError(null) };
}
