declare module 'lru-cache' {
  interface Options<K, V> {
    max?: number;
    maxAge?: number;
    length?: (value: V, key?: K) => number;
    dispose?: (key: K, value: V) => void;
    stale?: boolean;
  }

  class LRU<K, V> {
    constructor(options: Options<K, V>);
    set(key: K, value: V, maxAge?: number): boolean;
    get(key: K): V | undefined;
    peek(key: K): V | undefined;
    del(key: K): void;
    has(key: K): boolean;
    reset(): void;
    keys(): K[];
    values(): V[];
    readonly length: number;
    readonly itemCount: number;
  }

  export = LRU;
}
