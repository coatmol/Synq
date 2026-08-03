import { useRef, useEffect, useCallback, useState } from "react";
import { useDocumentHub, useDocumentStore } from "./useDocumentHub";

export function useBufferedInput() {
  const { text: remoteText } = useDocumentStore();
  const { insertText, deleteText } = useDocumentHub();

  const [localText, setLocalText] = useState(remoteText);
  const pendingOpsQueue = useRef<{ type: 'insert' | 'delete', index: number, text?: string, length?: number }[]>([]);
  const isFlushing = useRef(false);

  // Sync from remote only if there are no pending local operations
  // If we have pending local operations, we are typing, and we shouldn't overwrite our local state
  useEffect(() => {
    if (pendingOpsQueue.current.length === 0) {
      setLocalText(remoteText);
    }
  }, [remoteText]);

  const flushQueue = useCallback(() => {
    if (pendingOpsQueue.current.length === 0) {
      isFlushing.current = false;
      return;
    }

    const queue = [...pendingOpsQueue.current];
    pendingOpsQueue.current = [];

    // Dispatch all queued operations
    queue.forEach(op => {
      if (op.type === 'insert') {
        insertText(op.index, op.text!);
      } else if (op.type === 'delete') {
        deleteText(op.index, op.length!);
      }
    });

    isFlushing.current = false;
  }, [insertText, deleteText]);

  const scheduleFlush = useCallback(() => {
    if (!isFlushing.current) {
      isFlushing.current = true;
      requestAnimationFrame(flushQueue);
    }
  }, [flushQueue]);

  const queueInsert = useCallback((index: number, text: string) => {
    pendingOpsQueue.current.push({ type: 'insert', index, text });
    scheduleFlush();
  }, [scheduleFlush]);

  const queueDelete = useCallback((index: number, length: number) => {
    pendingOpsQueue.current.push({ type: 'delete', index, length });
    scheduleFlush();
  }, [scheduleFlush]);

  return {
    localText,
    setLocalText,
    queueInsert,
    queueDelete
  };
}
