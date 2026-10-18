"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectionLost, type AppError } from "@/lib/errors";
import type { Snapshot } from "@/lib/snapshot";

type LoaderResult<T> = { ok: true; data: Snapshot<T> } | { ok: false; error: AppError };

type PollingState<T> = {
  snapshot: Snapshot<T>;
  error: AppError | null;
  refreshing: boolean;
};

export function usePolling<T>(loader: () => Promise<LoaderResult<T>>, initial: Snapshot<T>, intervalMs = 30_000) {
  const [state, setState] = useState<PollingState<T>>({ snapshot: initial, error: null, refreshing: false });
  const [seen, setSeen] = useState(initial);
  const loaderRef = useRef(loader);
  const inFlight = useRef(false);

  if (seen !== initial) {
    setSeen(initial);
    if (initial.loadedAt >= state.snapshot.loadedAt) {
      setState({ snapshot: initial, error: null, refreshing: false });
    }
  }

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState((current) => ({ ...current, refreshing: true }));
    try {
      const result = await loaderRef.current();
      setState((current) =>
        result.ok
          ? {
              snapshot: result.data.loadedAt >= current.snapshot.loadedAt ? result.data : current.snapshot,
              error: null,
              refreshing: false,
            }
          : { ...current, error: result.error, refreshing: false },
      );
    } catch {
      setState((current) => ({
        ...current,
        refreshing: false,
        error: connectionLost,
      }));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, intervalMs);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, refresh]);

  return {
    data: state.snapshot.data,
    loadedAt: state.snapshot.loadedAt,
    error: state.error,
    refreshing: state.refreshing,
    refresh,
  };
}
