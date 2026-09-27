import { useEffect, useRef, useState } from 'react';
import NativeScoreRenderer from '@/specs/NativeScoreRenderer';
import type { DocState } from './useScoreDocument';

const LOADING: DocState = { status: 'loading' };

/**
 * Keeps a small set of PDFs open (setlists: the current song and its neighbours), so moving to
 * the next song reuses an already-open document whose start page is already rendered. Documents
 * that leave the set are closed; everything closes on unmount.
 */
export function useDocuments(paths: readonly string[]): (path: string | null | undefined) => DocState {
  const [states, setStates] = useState<ReadonlyMap<string, DocState>>(new Map());
  const open = useRef(new Map<string, { docId: string | null; cancelled: boolean }>());
  const key = [...new Set(paths)].sort().join('\n');

  useEffect(() => {
    const wanted = new Set(key ? key.split('\n') : []);
    const live = open.current;
    // Close what is no longer wanted.
    for (const [path, entry] of live) {
      if (wanted.has(path)) continue;
      entry.cancelled = true;
      if (entry.docId) NativeScoreRenderer.close(entry.docId);
      live.delete(path);
      setStates(prev => {
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
    }
    // Open what is new.
    for (const path of wanted) {
      if (live.has(path)) continue;
      const entry = { docId: null as string | null, cancelled: false };
      live.set(path, entry);
      NativeScoreRenderer.open(path).then(
        doc => {
          if (entry.cancelled) {
            NativeScoreRenderer.close(doc.docId);
            return;
          }
          entry.docId = doc.docId;
          setStates(prev => new Map(prev).set(path, { status: 'ready', doc }));
        },
        (e: Error) => {
          if (entry.cancelled) return;
          const message = e.message ?? '';
          const reason = /password|encrypt/i.test(message) ? 'password' : 'unreadable';
          setStates(prev => new Map(prev).set(path, { status: 'error', reason, message }));
        },
      );
    }
  }, [key]);

  useEffect(
    () => () => {
      for (const entry of open.current.values()) {
        entry.cancelled = true;
        if (entry.docId) NativeScoreRenderer.close(entry.docId);
      }
      open.current.clear();
    },
    [],
  );

  return path => (path ? states.get(path) ?? LOADING : LOADING);
}
