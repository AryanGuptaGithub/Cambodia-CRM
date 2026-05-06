/**
 * auditLogger.js
 * ──────────────────────────────────────────────
 * Single import point for everything observability-related.
 *
 * Provides:
 *   emitEvent(req, payload)           → writes a SystemEvent
 *   auditChange(req, payload)         → writes an AuditLog entry
 *   withTransaction(callback)         → wraps DB work in a Mongoose session
 *   extractUser(req)                  → pulls user info from req.user
 *
 * Design goal: every helper is non-throwing.
 * If writing to the observability collections fails, the error is
 * logged to stderr but NEVER propagated to the caller.
 * Business operations must not fail because of observability code.
 */

import mongoose from 'mongoose';
import SystemEvent, { EVENT_TYPES } from '../models/observability/SystemEvent.js';
import AuditLog    from '../models/observability/AuditLog.js';
import User        from '../models/User.js';            // ← NEW import
import captureDashboardSnapshot from './dashboardSnapshot.js';

export { EVENT_TYPES };

// ─────────────────────────────────────────────
// extractUser — now async, resolves real name from DB if missing/unknown
// ─────────────────────────────────────────────
export const extractUser = async (req) => {
  if (!req.user) {
    return {
      userId: null,
      name:   'anonymous',
      email:  null,
      role:   null,
      ip:     req.ip || req.headers?.['x-forwarded-for'] || null,
    };
  }

  if (req._auditUser) return req._auditUser;

  const tokenPayload = req.user;

  // TEMP DEBUG — remove after confirming fix
  // console.log('[auditLogger DEBUG] full token payload:', JSON.stringify(tokenPayload));

  let name =
    tokenPayload.name?.trim()     ||
    tokenPayload.username?.trim() ||
    null;

  const userId =
    tokenPayload._id?.toString()    ||
    tokenPayload.id?.toString()     ||
    tokenPayload.userId?.toString() ||
    null;

  const email = tokenPayload.email || req.body?.email || null;
  const role  = tokenPayload.role  || 'unknown';

  const needsFetch = !name || name === 'unknown' || name === '';
  if (needsFetch && userId) {
    try {
      const dbUser = await User.findById(userId).select('name').lean();
      // TEMP DEBUG — remove after confirming fix
      // console.log('[auditLogger DEBUG] dbUser result:', dbUser);
      if (dbUser?.name) name = dbUser.name;
    } catch (err) {
      console.error('[auditLogger.extractUser] Failed to fetch user name:', err.message);
    }
  }

  const result = {
    userId,
    name:  name || 'unknown',
    email,
    role,
    ip:    req.ip || req.headers?.['x-forwarded-for'] || null,
  };

  req._auditUser = result;
  return result;
};



export const captureSnapshotBefore = async () => {
  return await captureDashboardSnapshot();
};

// ─────────────────────────────────────────────
// emitEvent — now awaits extractUser
// ─────────────────────────────────────────────
export const emitEvent = async (req, payload) => {
  if (!payload?.eventType) {
    console.error('[auditLogger] BLOCKED missing eventType.');
    return;
  }
  try {
    const snapshotAfter = await captureDashboardSnapshot();
    // console.log('[auditLogger DEBUG] snapshotAfter captured:', !!snapshotAfter); // ← ADD
    // console.log('[auditLogger DEBUG] snapshotBefore in payload:', !!payload.metadata?.snapshotBefore); // ← ADD
    await SystemEvent.record({
      traceId:     req.traceId || null,
      triggeredBy: await extractUser(req),
      httpMethod:  req.method,
      httpUrl:     req.originalUrl,
      ...payload,
      metadata: {
        ...(payload.metadata || {}),
        snapshotBefore: payload.metadata?.snapshotBefore || null,
        snapshotAfter,
      },
    });
  } catch (err) {
    console.error('[auditLogger.emitEvent] Error:', err.message);
  }
};

// ─────────────────────────────────────────────
// auditChange — now awaits extractUser
// ─────────────────────────────────────────────
export const auditChange = async (req, payload) => {
  try {
    await AuditLog.record({
      traceId:     req.traceId || null,
      triggeredBy: await extractUser(req),    // ← await added
      ...payload,
    });
  } catch (err) {
    console.error('[auditLogger.auditChange] Error:', err.message);
  }
};

// ─────────────────────────────────────────────
// withTransaction (unchanged)
// ─────────────────────────────────────────────
export const withTransaction = async (callback) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
// Convenience: build a changes array entry
// ─────────────────────────────────────────────
export const change = (module, action, before, after, status = 'SUCCESS', docId = null, error = null) => ({
  module,
  action,
  before,
  after,
  status,
  docId,
  error,
});

export default {
  emitEvent,
  auditChange,
  withTransaction,
  extractUser,
  change,
  EVENT_TYPES,
};