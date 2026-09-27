import { useMemo, useSyncExternalStore } from 'react';

/**
 * Live queries: repositories call notifyChanged(table) after writes; hooks re-run their query when a
 * table they read from changes. Synchronous SQLite reads are cheap, so re-querying beats diffing.
 */
export type Table = 'scores' | 'setlists' | 'setlist_items' | 'collections' | 'tags' | 'pedal_mappings' | 'ink';

const versions = new Map<Table, number>();
const listeners = new Map<Table, Set<() => void>>();

export function notifyChanged(...tables: Table[]): void {
  const fired = new Set<() => void>();
  for (const t of tables) {
    versions.set(t, (versions.get(t) ?? 0) + 1);
    listeners.get(t)?.forEach(l => fired.add(l));
  }
  fired.forEach(l => l());
}

function subscribe(tables: readonly Table[], fn: () => void): () => void {
  for (const t of tables) {
    let set = listeners.get(t);
    if (!set) listeners.set(t, (set = new Set()));
    set.add(fn);
  }
  return () => tables.forEach(t => listeners.get(t)?.delete(fn));
}

const versionKey = (tables: readonly Table[]) => tables.map(t => versions.get(t) ?? 0).join('.');

/** Re-runs `query` whenever one of `tables` changes (or deps change). */
export function useLiveQuery<T>(tables: readonly Table[], query: () => T, deps: readonly unknown[]): T {
  const tablesKey = tables.join(',');
  const sub = useMemo(() => (fn: () => void) => subscribe(tables, fn), [tablesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const version = useSyncExternalStore(sub, () => versionKey(tables));
  return useMemo(query, [version, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
}
