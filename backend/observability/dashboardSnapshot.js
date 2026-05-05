/**
 * dashboardSnapshot.js
 * Place at: backend/observability/dashboardSnapshot.js
 *
 * Captures live totals matching the 8 dashboard cards.
 * Non-throwing — returns null on any failure so it never blocks business logic.
 */

import mongoose from 'mongoose';

// Lazy model lookup — safe to call before any model is imported
const getModel = (name) => mongoose.models[name] || null;

const toFixed2 = (n) => parseFloat(((n) || 0).toFixed(2));
const first    = (agg) => toFixed2(agg?.[0]?.total ?? 0);

export async function captureDashboardSnapshot() {
  try {
    const SaleSummary  = getModel('SaleSummary');
    const ReportInHand = getModel('ReportInHand');
    const Expense      = getModel('Expense');
    const Payroll      = getModel('Payroll');
    const Destination  = getModel('Destination');

    const now = new Date();

    // Current month
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const mEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Previous month
    const pmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const pmEnd   = new Date(now.getFullYear(), now.getMonth(),     0, 23, 59, 59, 999);

    // Each fallback is a NEW function call — never reuse a single Promise object
    const fb = () => Promise.resolve([{ total: 0 }]);

    const [
      allSalesRes,
      monthSalesRes,
      stockRes,
      expenseRes,
      payrollRes,
      balanceRes,
      overdueRes,
      pendingRes,
    ] = await Promise.all([

      // 1. Total Sales — all time
      SaleSummary
        ? SaleSummary.aggregate([
            { $group: { _id: null, total: { $sum: '$totalAmount' } } },
          ])
        : fb(),

      // 2. Current Month Sales
      SaleSummary
        ? SaleSummary.aggregate([
            { $match: { createdAt: { $gte: mStart, $lte: mEnd } } },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } },
          ])
        : fb(),

      // 3. Stock in Hands — warehouse: sum(batch.boxes × batch.lc)
      ReportInHand
        ? ReportInHand.aggregate([
            { $unwind: { path: '$batches', preserveNullAndEmptyArrays: false } },
            {
              $group: {
                _id: null,
                total: {
                  $sum: {
                    $multiply: [
                      { $ifNull: ['$batches.boxes', 0] },
                      { $ifNull: ['$batches.lc',   0] },
                    ],
                  },
                },
              },
            },
          ])
        : fb(),

      // 4. Total Expense — current month  (field: amount, date)
      Expense
        ? Expense.aggregate([
            { $match: { date: { $gte: mStart, $lte: mEnd } } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ])
        : fb(),

      // 5. Total Payroll — previous month  (field: netSalary)
      Payroll
        ? Payroll.aggregate([
            { $match: { createdAt: { $gte: pmStart, $lte: pmEnd } } },
            { $group: { _id: null, total: { $sum: '$netSalary' } } },
          ])
        : fb(),

      // 6. Company Balance — sum of Destination.totalAmount
      Destination
        ? Destination.aggregate([
            { $group: { _id: null, total: { $sum: '$totalAmount' } } },
          ])
        : fb(),

      // 7. Overdue — past due date, paymentStatus not Paid/Cash/Return
      SaleSummary
        ? SaleSummary.aggregate([
            {
              $match: {
                dueDate:       { $lt: now },
                paymentStatus: { $nin: ['Paid', 'Cash', 'Return'] },
              },
            },
            {
              $group: {
                _id: null,
                total: {
                  $sum: {
                    $subtract: ['$totalAmount', { $ifNull: ['$paidAmount', 0] }],
                  },
                },
              },
            },
          ])
        : fb(),

      // 8. Pending Collection — Credit / Partial Paid / Unpaid
      SaleSummary
        ? SaleSummary.aggregate([
            {
              $match: {
                paymentStatus: { $in: ['Credit', 'Partial Paid', 'Unpaid'] },
              },
            },
            {
              $group: {
                _id: null,
                total: {
                  $sum: {
                    $subtract: ['$totalAmount', { $ifNull: ['$paidAmount', 0] }],
                  },
                },
              },
            },
          ])
        : fb(),
    ]);

    return {
      totalSales:        first(allSalesRes),
      currentMonthSales: first(monthSalesRes),
      stockInHands:      first(stockRes),
      totalExpense:      first(expenseRes),
      totalPayroll:      first(payrollRes),
      companyBalance:    first(balanceRes),
      overdue:           first(overdueRes),
      pendingCollection: first(pendingRes),
      capturedAt:        now.toISOString(),
    };

  } catch (err) {
    console.error('[dashboardSnapshot] Failed to capture snapshot:', err.message, '\n', err.stack);
    return null;
  }
}

export default captureDashboardSnapshot;