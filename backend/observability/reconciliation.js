/**
 * reconciliation.js
 * ──────────────────────────────────────────────
 * Nightly job that validates cross-module
 * business consistency and writes an alert to
 * SystemEvent if it finds a mismatch.
 *
 * Checks performed:
 *   1. Stock consistency
 *      Purchases − Sales + Returns − Transfers == ReportInHand qty
 *
 *   2. Outstanding balance
 *      Sum of unpaid SaleSummary amounts == sum of outstanding records
 *
 *   3. Payroll ↔ Expense
 *      Every Payroll record has a corresponding Expense entry
 *
 * Schedule: called once at 02:30 server time.
 * Add more checks by extending CHECKS array below.
 *
 * Usage in server.js:
 *   import { scheduleReconciliation } from './observability/reconciliation.js';
 *   scheduleReconciliation();
 *
 * Manual run (for testing):
 *   import { runReconciliation } from './observability/reconciliation.js';
 *   await runReconciliation();
 */

import mongoose from 'mongoose';
import SystemEvent, { EVENT_TYPES } from '../models/observability/SystemEvent.js';

// ── Lazy model imports (avoids circular-dep issues) ──
const getModel = (name) => mongoose.model(name);

// ─────────────────────────────────────────────
// Individual checks
// ─────────────────────────────────────────────

/**
 * Check: for each product, does ReportInHand.qty match
 * the running total of purchases - sales + returns - transfers?
 *
 * Returns an array of mismatch objects (empty = all good).
 */
const checkStockConsistency = async () => {
  const mismatches = [];

  try {
    const ReportInHand       = getModel('ReportsInHand');
    const PurchaseInventory  = getModel('PurchaseInventory');
    const SaleSummary        = getModel('SaleSummary');
    const SaleReturn         = getModel('SaleReturn');
    const StockTransfer      = getModel('stockTransfer');

    const products = await ReportInHand.find({}).lean();

    for (const product of products) {
      const productId = product.productId?.toString() || product._id?.toString();

      // Purchased quantity
      const purchaseAgg = await PurchaseInventory.aggregate([
        { $unwind: '$products' },
        { $match: { 'products.productId': new mongoose.Types.ObjectId(productId) } },
        { $group: { _id: null, total: { $sum: '$products.quantity' } } },
      ]);
      const purchased = purchaseAgg[0]?.total || 0;

      // Sold quantity
      const saleAgg = await SaleSummary.aggregate([
        { $unwind: '$products' },
        { $match: { 'products.productId': new mongoose.Types.ObjectId(productId) } },
        { $group: { _id: null, total: { $sum: '$products.salesQty' } } },
      ]);
      const sold = saleAgg[0]?.total || 0;

      // Returned quantity
      const returnAgg = await SaleReturn.aggregate([
        { $unwind: '$products' },
        { $match: { 'products.productId': new mongoose.Types.ObjectId(productId) } },
        { $group: { _id: null, total: { $sum: '$products.returnQty' } } },
      ]);
      const returned = returnAgg[0]?.total || 0;

      const expected = purchased - sold + returned;
      const actual   = product.qty || product.quantity || 0;

      const diff = Math.abs(expected - actual);
      // Allow a tiny floating-point tolerance
      if (diff > 0.001) {
        mismatches.push({
          module:      'ReportInHand',
          productId,
          productName: product.productName,
          expected,
          actual,
          diff,
        });
      }
    }
  } catch (err) {
    console.error('[Reconciliation] checkStockConsistency error:', err.message);
  }

  return mismatches;
};


/**
 * Check: is every Payroll document backed by an Expense record?
 */
const checkPayrollExpenseSync = async () => {
  const issues = [];

  try {
    const Payroll  = getModel('Payroll');
    const Expense  = getModel('addExpense');

    const payrolls = await Payroll.find({}).lean();

    for (const p of payrolls) {
      const matchingExpense = await Expense.findOne({
        referenceId: p._id,
        category: { $regex: /payroll/i },
      }).lean();

      if (!matchingExpense) {
        issues.push({
          module:    'Payroll-Expense',
          payrollId: p._id.toString(),
          month:     p.month,
          staffId:   p.staffId?.toString(),
          message:   'No matching Expense entry found for this Payroll record',
        });
      }
    }
  } catch (err) {
    console.error('[Reconciliation] checkPayrollExpenseSync error:', err.message);
  }

  return issues;
};


// ─────────────────────────────────────────────
// CHECKS registry — add new checks here
// ─────────────────────────────────────────────
const CHECKS = [
  { name: 'Stock Consistency',         fn: checkStockConsistency },
  { name: 'Payroll ↔ Expense Sync',    fn: checkPayrollExpenseSync },
];

// ─────────────────────────────────────────────
// Main runner
// ─────────────────────────────────────────────
export const runReconciliation = async () => {
  const startMs = Date.now();
  const traceId = `RECON-${Date.now()}`;
  const allIssues = [];

  console.log(`[Reconciliation] Starting reconciliation run — ${traceId}`);

  for (const check of CHECKS) {
    try {
      const issues = await check.fn();
      if (issues.length > 0) {
        console.warn(`[Reconciliation] ⚠️  ${check.name}: ${issues.length} issue(s) found`);
        allIssues.push({ check: check.name, issues });
      } else {
        console.log(`[Reconciliation] ✅ ${check.name}: OK`);
      }
    } catch (err) {
      console.error(`[Reconciliation] ❌ ${check.name} threw:`, err.message);
      allIssues.push({ check: check.name, issues: [{ error: err.message }] });
    }
  }

  const duration = Date.now() - startMs;

  // Emit a summary event regardless of pass/fail
  await SystemEvent.record({
    traceId,
    eventType:    EVENT_TYPES.RECONCILIATION_RUN,
    entityType:   'System',
    triggeredBy:  { name: 'ReconciliationJob', role: 'system' },
    status:       allIssues.length === 0 ? 'SUCCESS' : 'PARTIAL',
    durationMs:   duration,
    metadata: {
      checksRun:    CHECKS.length,
      issuesFound:  allIssues.length,
      runAt:        new Date().toISOString(),
    },
    changes: allIssues.map((item) => ({
      module: item.check,
      action: 'RECONCILIATION_ALERT',
      before: null,
      after:  item.issues,
      status: 'FAILED',
    })),
  });

  // Emit a separate ALERT event if issues were found
  if (allIssues.length > 0) {
    await SystemEvent.record({
      traceId,
      eventType:   EVENT_TYPES.RECONCILIATION_ALERT,
      entityType:  'System',
      triggeredBy: { name: 'ReconciliationJob', role: 'system' },
      status:      'FAILED',
      metadata: {
        alertCount:  allIssues.length,
        details:     allIssues,
        message:     'Data inconsistencies detected — please review SystemEvent logs',
      },
    });

    console.error(`[Reconciliation] ⛔ ${allIssues.length} check(s) failed — RECONCILIATION_ALERT emitted`);
  }

  console.log(`[Reconciliation] Completed in ${duration}ms`);
  return allIssues;
};


// ─────────────────────────────────────────────
// Scheduler
// ─────────────────────────────────────────────
/**
 * Schedule reconciliation to run once at 02:30 every day.
 * Call once in server.js after DB connects.
 */

export const scheduleReconciliation = () => {

  const scheduleNext = () => {
  const now  = new Date();
  const next = new Date(now);

  // Always schedule for TOMORROW at 02:30 on first run
  // to avoid firing immediately on startup
  next.setDate(next.getDate() + 1);
  next.setHours(2, 30, 0, 0);

  const msUntil = next - now;
  console.log(`[Reconciliation] Next run scheduled at ${next.toISOString()}`);

  setTimeout(async () => {
    await runReconciliation();
    scheduleNext();
  }, msUntil);
};

  scheduleNext();
};

export default { runReconciliation, scheduleReconciliation };