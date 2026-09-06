import { Router } from 'express';
import { requireAuthentication } from '../../../modules/identity/auth.middleware.js';
import { subscribeToChanges } from '../../../infrastructure/realtime.js';

export const realtimeRouter = Router();

realtimeRouter.get('/stream', requireAuthentication, (request, response) => {
  response.status(200).set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  response.flushHeaders();
  response.write('event: connected\ndata: {}\n\n');

  const unsubscribe = subscribeToChanges((event) => {
    response.write(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
  });
  const heartbeat = setInterval(() => response.write(': keepalive\n\n'), 25_000);
  request.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    response.end();
  });
});
