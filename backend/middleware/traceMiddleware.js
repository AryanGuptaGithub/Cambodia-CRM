/**
 * traceMiddleware.js
 * ──────────────────────────────────────────────
 * Generates a unique TRACE ID for every incoming
 * HTTP request and attaches it to:
 *   - req.traceId          (for use in route handlers)
 *   - res.setHeader(...)   (returned to the client for debugging)
 *
 * This is the FIRST middleware that should be registered in server.js.
 *
 * Usage in server.js:
 *   import { traceMiddleware } from './middleware/traceMiddleware.js';
 *   app.use(traceMiddleware);
 *
 * Usage in a route handler:
 *   router.post('/sales', async (req, res) => {
 *     const { traceId } = req;
 *     // pass traceId into every service call, event emit, and audit log
 *   });
 */

import { nanoid } from 'nanoid';

/**
 * Generates a short, URL-safe trace ID.
 * Format: TRACE-<10 random chars>
 * Example: TRACE-V8xKqZ2mNp
 */
export const generateTraceId = () => `TRACE-${nanoid(10)}`;

/**
 * Express middleware that attaches a trace ID to every request.
 * Re-uses the X-Trace-ID header if the caller provides one
 * (useful for end-to-end tracing from a frontend or API gateway).
 */
export const traceMiddleware = (req, res, next) => {
  const incomingTrace = req.headers['x-trace-id'];
  const traceId = incomingTrace && /^TRACE-[A-Za-z0-9_-]{10}$/.test(incomingTrace)
    ? incomingTrace
    : generateTraceId();

  req.traceId = traceId;
  res.setHeader('X-Trace-ID', traceId);

  next();
};

export default traceMiddleware;