function defaultKey(args: readonly unknown[]): string {
  return JSON.stringify(args);
}

/**
 * Cache a function result by argument values.
 *
 * Promise-returning functions cache the in-flight promise, so concurrent calls with the same
 * params share the same work. Rejected promises are evicted so later calls can retry.
 *
 * @example
 * const fetchUser = cached(async (id: string) => db.users.findById(id));
 *
 * await fetchUser("U123"); // calls db
 * await fetchUser("U123"); // returns cached promise/result
 * await fetchUser("U456"); // calls db
 */
export function memoise<P extends unknown[], T>(
  fn: (...args: P) => T,
  keyFn: (args: P) => string = defaultKey,
): (...args: P) => T {
  const cache = new Map<string, T>();

  return (...args: P): T => {
    const key = keyFn(args);
    const cachedValue = cache.get(key);
    if (cachedValue !== undefined || cache.has(key)) {
      return cachedValue as T;
    }

    const resolved = fn(...args);
    cache.set(key, resolved);

    if (resolved instanceof Promise) {
      resolved.catch(() => {
        cache.delete(key);
      });
    }

    return resolved;
  };
}
