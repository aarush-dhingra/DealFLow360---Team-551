'use client';

import { useEffect, useRef } from 'react';
import { getToken } from './api';

/** Subscribe to committed backend changes. This is a streaming connection, not polling. */
export function useLiveUpdates(onChange: () => void) {
  const callback = useRef(onChange);
  useEffect(() => { callback.current = onChange; }, [onChange]);

  useEffect(() => {
    const controller = new AbortController();
    const token = getToken();
    if (!token) return () => controller.abort();
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = async () => {
      try {
        const response = await fetch('/api/v1/events/stream', {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal
        });
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';
          frames.forEach((frame) => {
            if (frame.includes('event: change')) callback.current();
          });
        }
      } catch {
        // Connection failures are handled below; a dropped stream never turns
        // into periodic data polling.
      } finally {
        if (!controller.signal.aborted) reconnectTimer = setTimeout(connect, 1_000);
      }
    };
    connect();
    return () => { controller.abort(); if (reconnectTimer) clearTimeout(reconnectTimer); };
  }, []);
}
