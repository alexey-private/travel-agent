"use client";

import { useState, useEffect, useCallback, useRef, type DependencyList } from "react";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
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
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef.current().then(
      (data) => setState({ data, loading: false, error: null }),
      (err: unknown) => setState({ data: null, loading: false, error: err instanceof Error ? err.message : "Unknown error" }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const setData: React.Dispatch<React.SetStateAction<T | null>> = useCallback(
    (value) => setState((s) => ({ ...s, data: typeof value === "function" ? (value as (prev: T | null) => T | null)(s.data) : value })),
    [],
  );

  return { ...state, reload: run, setData };
}
