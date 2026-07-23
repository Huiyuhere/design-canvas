/**
 * Minimal memory location hook for wouter — lets every iPhone frame run its
 * own isolated router so vendored pages render at their real routes without
 * touching the canvas URL.
 */
import { useSyncExternalStore } from "react";

export interface MemoryLocationResult {
  hook: (() => [string, (to: string) => void]) & { hrefs?: (href: string) => string };
  searchHook: () => string;
  navigate: (to: string) => void;
  getPath: () => string;
}

export default function memoryLocation(initialPath: string): MemoryLocationResult {
  const [initialPathname, initialSearch = ""] = initialPath.split("?");
  let pathname = initialPathname;
  let search = initialSearch;
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((l) => l());
  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  };

  const navigate = (to: string) => {
    const [p, s = ""] = to.split("?");
    pathname = p;
    search = s;
    notify();
  };

  const hook = (() => {
    const path = useSyncExternalStore(subscribe, () => pathname);
    return [path, navigate] as [string, (to: string) => void];
  }) as MemoryLocationResult["hook"];
  hook.hrefs = (href: string) => href;

  const searchHook = () => useSyncExternalStore(subscribe, () => search);

  return { hook, searchHook, navigate, getPath: () => (search ? `${pathname}?${search}` : pathname) };
}
