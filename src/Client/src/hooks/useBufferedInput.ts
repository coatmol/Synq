import {useRef, useEffect, useCallback, useState} from "react";
import {useDocumentHub, useDocumentStore} from "./useDocumentHub";

export function useBufferedInput() {
  const {text: remoteText} = useDocumentStore();
  const {insertText, deleteText} = useDocumentHub();

  const [localText, setLocalText] = useState(() => remoteText.replace(/\r\n/g, '\n'));
  const [remoteUpdateText, setRemoteUpdateText] = useState<{ text: string, version: number } | null>(null);
  const pendingOpsQueue = useRef<{ type: 'insert' | 'delete', index: number, text?: string, length?: number }[]>([]);
  const isFlushing = useRef(false);

  const [syncTrigger, setSyncTrigger] = useState(0);
  const lastProcessedRemoteText = useRef(remoteText);

  // Sync from remote only if:
  // 1. There are no pending local operations (we're not mid-typing)
  // 2. remoteText has actually changed (a real remote update arrived,
  //    not just syncTrigger re-firing with the same stale value)
  useEffect(() => {
    if (pendingOpsQueue.current.length === 0 && remoteText !== lastProcessedRemoteText.current) {
      lastProcessedRemoteText.current = remoteText;
      const newText = remoteText.replace(/\r\n/g, '\n');
      setLocalText(newText);
      setRemoteUpdateText({text: newText, version: Date.now()});
    }
  }, [remoteText, syncTrigger]);

  const flushQueue = useCallback(async () => {
    try {
      while (pendingOpsQueue.current.length > 0) {
        // Optimize the queue by combining contiguous operations
        const optimizedQueue: typeof pendingOpsQueue.current = [];
        for (const op of pendingOpsQueue.current) {
          const last = optimizedQueue[optimizedQueue.length - 1];
          if (last && last.type === 'insert' && op.type === 'insert' && typeof last.text === 'string' && typeof op.text === 'string' && last.index + last.text.length === op.index) {
            last.text += op.text;
          } else if (last && last.type === 'delete' && op.type === 'delete' && typeof last.length === 'number' && typeof op.length === 'number' && last.index === op.index) {
            last.length += op.length;
          } else {
            optimizedQueue.push({...op});
          }
        }
        pendingOpsQueue.current = optimizedQueue;

        // Execute the first operation in the queue
        const op = pendingOpsQueue.current[0];
        try {
          // If inserting a massive chunk (e.g. paste), chunk it to avoid SignalR limits
          if (op.type === 'insert' && op.text && op.text.length > 5000) {
            const chunk = op.text.substring(0, 5000);
            const remainder = op.text.substring(5000);
            await insertText(op.index, chunk);
            // Instead of popping, mutate the operation to have the remainder and shift index
            op.text = remainder;
            op.index += 5000;
            continue; // Loop will pick up the remainder next
          }

          if (op.type === 'insert') {
            await insertText(op.index, op.text!);
          } else if (op.type === 'delete') {
            await deleteText(op.index, op.length!);
          }
        } catch (err) {
          console.error("Failed to sync operation with backend:", err);
          break; // Stop flushing and wait for reconnect or next flush
        }

        // Only remove the operation AFTER it has been successfully processed
        pendingOpsQueue.current.shift();
      }
    } finally {
      isFlushing.current = false;
      // Trigger a sync check in case remoteText arrived while we were flushing
      setSyncTrigger(prev => prev + 1);
    }
  }, [insertText, deleteText]);

  const scheduleFlush = useCallback(() => {
    if (!isFlushing.current) {
      isFlushing.current = true;
      requestAnimationFrame(flushQueue);
    }
  }, [flushQueue]);

  const queueInsert = useCallback((index: number, text: string) => {
    pendingOpsQueue.current.push({type: 'insert', index, text});
    scheduleFlush();
  }, [scheduleFlush]);

  const queueDelete = useCallback((index: number, length: number) => {
    pendingOpsQueue.current.push({type: 'delete', index, length});
    scheduleFlush();
  }, [scheduleFlush]);

  return {
    localText,
    setLocalText,
    remoteUpdateText,
    queueInsert,
    queueDelete
  };
}
