import { useEffect, useState } from 'react';
import NativeScoreRenderer, { type OpenedDocument } from '@/specs/NativeScoreRenderer';

export type DocState =
  | { status: 'loading' }
  | { status: 'ready'; doc: OpenedDocument }
  | { status: 'error'; reason: 'password' | 'unreadable'; message: string };

/** Opens the PDF for the reader and closes it (safely, on its render thread) when the reader leaves. */
export function useScoreDocument(path: string | null): DocState {
  const [state, setState] = useState<DocState>({ status: 'loading' });

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    let opened: string | null = null;
    setState({ status: 'loading' });
    NativeScoreRenderer.open(path).then(
      doc => {
        if (cancelled) {
          NativeScoreRenderer.close(doc.docId);
          return;
        }
        opened = doc.docId;
        setState({ status: 'ready', doc });
      },
      (e: Error) => {
        if (cancelled) return;
        const message = e.message ?? '';
        setState({ status: 'error', reason: /password|encrypt|PASSWORD/i.test(message) ? 'password' : 'unreadable', message });
      },
    );
    return () => {
      cancelled = true;
      if (opened) NativeScoreRenderer.close(opened);
    };
  }, [path]);

  return state;
}
