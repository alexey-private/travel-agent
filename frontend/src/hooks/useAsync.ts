"use client";

import { useState, useEffect, useCallback, useRef, type DependencyList } from "react";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  /** A dictionary key when the failure came from the API; raw text otherwise. */
  error: string | null;
}

interface UseAsyncResult<T> extends AsyncState<T> {
  reload: () => void;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

export function useAsync<T>(
  fn: () => Promise<T>,
  deps: DependencyList = [],
): UseAsyncResult<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: false, error: null });

  // `fn` is a fresh closure on every render, so it cannot go in `run`'s
  // dependency list without re-running the request forever. The ref is written
  // in an effect rather than during render, and effects run top-down, so it is
  // already current by the time the effect below calls `run`.
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef.current().then(
      (data) => setState({ data, loading: false, error: null }),
      (err: unknown) => setState({ data: null, loading: false, error: err instanceof Error ? err.message : "errors.unknown" }),
    );
  }, []);

  // Fetching is exactly the external-system synchronisation effects are for.
  // `deps` is the caller's array, so it cannot be verified statically.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const setData: React.Dispatch<React.SetStateAction<T | null>> = useCallback(
    (value) => setState((s) => ({ ...s, data: typeof value === "function" ? (value as (prev: T | null) => T | null)(s.data) : value })),
    [],
  );

  return { ...state, reload: run, setData };
}
