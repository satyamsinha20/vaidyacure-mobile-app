/**
 * Remembers what pages loaded (in this browser tab only), so a page or tab
 * opened again shows its last data at once and then the fresh data from the
 * server. Any change sent to the server (POST/PUT/PATCH/DELETE) and logout
 * clear everything, so old data never shows after an action.
 */
const MAX_ENTRIES = 100;
const store = new Map<string, unknown>();

export function clearCache(): void {
  store.clear();
}

/** The remembered value for `key`, if any */
export function peekCache<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

/**
 * Shows the remembered value at once (if there is one and `useCache` is on),
 * then fetches and remembers the fresh value, and shows it only if it is
 * different (so a form the admin has started editing is not reset for
 * nothing). A Refresh button passes `useCache = false`. Errors are thrown as usual.
 */
export async function cachedLoad<T>(key: string, fetcher: () => Promise<T>, apply: (value: T) => void, useCache = true): Promise<T> {
  // Never keep data on the server (it is shared by every visitor)
  if (typeof window === "undefined") {
    const value = await fetcher();
    apply(value);
    return value;
  }
  const showedCached = useCache && store.has(key);
  const previous = store.get(key);
  if (showedCached) apply(previous as T);
  const fresh = await fetcher();
  store.delete(key);
  store.set(key, fresh);
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  if (!showedCached || JSON.stringify(fresh) !== JSON.stringify(previous)) apply(fresh);
  return fresh;
}
