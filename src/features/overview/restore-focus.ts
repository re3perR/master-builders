import { useEffect, type RefObject } from "react";

let pending: { state: string; control: string } | null = null;

export function rememberFocus(state: string, control: string) {
  pending = { state, control };
}

export function useRestoreFocus(state: string, container: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const target = pending;
    pending = null;
    if (target?.state !== state) return;
    container.current?.querySelector<HTMLElement>(`[data-control="${target.control}"]`)?.focus();
  }, [state, container]);
}
