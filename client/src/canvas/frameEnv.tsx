/**
 * FrameEnv — per-frame environment context. Vendored surfaces originally read
 * `window.location.search`; inside canvas frames each surface has its own
 * virtual search string. `useFrameSearch()` returns the frame-scoped search
 * when mounted inside a frame, otherwise the real window search (preview mode).
 */
import { createContext, useContext } from "react";

export const FrameSearchContext = createContext<string | null>(null);

/** Frame-aware replacement for `new URLSearchParams(window.location.search)`. */
export function useFrameSearchParams(): URLSearchParams {
  const frameSearch = useContext(FrameSearchContext);
  return new URLSearchParams(frameSearch ?? window.location.search);
}
