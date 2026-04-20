// routes/purcharsing/purchaseOut.js  –  full file with activity logging
import express from "express";
import PaymentsOut from "../../models/purcharsing/purchaseOut.js";
import CompanyAccount from "../../models/accounts/Destination.js";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import { logActivity } from "../activity/activityLog.js"; // ✅ activity logger

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helper: populate bank name onto a payment object
// ─────────────────────────────────────────────────────────────────────────────
const withBankName = async (paymentObj) => {
  if (!paymentObj.bank)
    return { ...paymentObj, bankName: "No Bank", sourceBank: "No Bank" };
  try {
    const account = await CompanyAccount.findById(paymentObj.bank);
    const name = account ? account.name : "Unknown Bank";
    return { ...paymentObj, bankName: name, sourceBank: name };
  } catch {
    return {
      ...paymentObj,
      bankName: "Unknown Bank",
      sourceBank: "Unknown Bank",
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /  –  All payments out
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const payments = await PaymentsOut.find().sort({ createdAt: -1 });
    const paymentsWithBankNames = await Promise.all(
      payments.map((p) => withBankName(p.toObject())),
    );
    res.json(paymentsWithBankNames);
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:id  –  Single payment out
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const payment = await PaymentsOut.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    res.json(await withBankName(payment.toObject()));
  } catch (error) {
    console.error("Error fetching payment:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /  –  Create payment out                              ✅ LOGGED
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const {
      paymentDate,
      invoiceNo,
      invoiceDate,
      supplierName,
      amount,
      invoiceAmount,
      bank,
      remarks,
    } = req.body;

    const existingPayment = await PaymentsOut.findOne({ invoiceNo });
    if (existingPayment) {
      return res
        .status(400)
        .json({ message: "Payment with this invoice number already exists" });
    }

    const companyAccount = await CompanyAccount.findById(bank);
    if (!companyAccount)
      return res.status(404).json({ message: "Company account not found" });
    if (companyAccount.totalAmount < amount)
      return res
        .status(400)
        .json({ message: "Insufficient funds in company account" });

    const newPayment = new PaymentsOut({
      paymentDate,
      invoiceNo,
      invoiceDate,
      supplierName,
      invoiceAmount: parseFloat(invoiceAmount),
      paidAmount: parseFloat(amount),
      bank: bank || "",
      remarks: remarks || "",
    });

    const savedPayment = await newPayment.save();

    companyAccount.totalAmount -= parseFloat(amount);
    await companyAccount.save();

    // ✅ Log CREATE
    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Created Payment Out: ${savedPayment.invoiceNo}`,
      tableName: "paymentsOut",
      tableLabel: "Payment Out",
      recordId: savedPayment._id,
      referenceNumber: savedPayment.invoiceNo,
      newData: savedPayment.toObject(),
      description: `New payment out — Invoice: ${savedPayment.invoiceNo}, Supplier: ${savedPayment.supplierName}, Paid: $${parseFloat(amount).toFixed(2)}, Bank: ${companyAccount.name}, Remaining balance: $${companyAccount.totalAmount.toFixed(2)}`,
      refField: "invoiceNo",
    });

    res.status(201).json({
      message: "Payment created successfully",
      payment: await withBankName(savedPayment.toObject()),
      updatedAccountBalance: companyAccount.totalAmount,
    });
  } catch (error) {
    console.error("Error in POST /payments-out:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:id  –  Update payment out                            ✅ LOGGED
// ─────────────────────────────────────────────────────────────────────────────
router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const {
      paymentDate,
      invoiceNo,
      invoiceDate,
      supplierName,
      amount,
      invoiceAmount,
      bank,
      remarks,
    } = req.body;

    const existingPayment = await PaymentsOut.findById(req.params.id);
    if (!existingPayment)
      return res.status(404).json({ message: "Payment not found" });

    // ✅ Full snapshot BEFORE update
    const previousData = existingPayment.toObject();

    const targetBank = bank || existingPayment.bank;
    const companyAccount = await CompanyAccount.findById(targetBank);
    if (!companyAccount)
      return res.status(404).json({ message: "Company account not found" });

    const oldAmount = existingPayment.paidAmount;
    const newAmount = parseFloat(amount);
    const amountDifference = newAmount - oldAmount;

    if (companyAccount.totalAmount < amountDifference) {
      return res
        .status(400)
        .json({
          message: "Insufficient funds in company account for this update",
        });
    }

    const updatedPayment = await PaymentsOut.findByIdAndUpdate(
      req.params.id,
      {
        paymentDate,
        invoiceNo,
        invoiceDate,
        supplierName,
        invoiceAmount: parseFloat(invoiceAmount),
        paidAmount: newAmount,
        bank: bank || existingPayment.bank,
        remarks: remarks || "",
      },
      { new: true, runValidators: true },
    );

    companyAccount.totalAmount -= amountDifference;
    await companyAccount.save();

    // ✅ Log UPDATE with full before/after snapshot
    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Payment Out: ${updatedPayment.invoiceNo}`,
      tableName: "paymentsOut",
      tableLabel: "Payment Out",
      recordId: updatedPayment._id,
      referenceNumber: updatedPayment.invoiceNo,
      previousData, // full old payment
      newData: updatedPayment.toObject(), // full new payment
      description: `Payment out ${updatedPayment.invoiceNo} updated — Supplier: ${updatedPayment.supplierName}, Old paid: $${oldAmount.toFixed(2)}, New paid: $${newAmount.toFixed(2)}, Bank: ${companyAccount.name}, New balance: $${companyAccount.totalAmount.toFixed(2)}`,
      refField: "invoiceNo",
    });

    res.json({
      message: "Payment updated successfully",
      payment: await withBankName(updatedPayment.toObject()),
      updatedAccountBalance: companyAccount.totalAmount,
    });
  } catch (error) {
    console.error("Error updating payment:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:id  –  Delete single payment out                  ✅ LOGGED
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const deletedPayment = await PaymentsOut.findById(req.params.id);
    if (!deletedPayment)
      return res.status(404).json({ message: "Payment not found" });

    // ✅ Full snapshot before deletion
    const snapshot = deletedPayment.toObject();

    const companyAccount = await CompanyAccount.findById(deletedPayment.bank);
    if (companyAccount) {
      companyAccount.totalAmount += deletedPayment.paidAmount;
      await companyAccount.save();
    }

    await PaymentsOut.findByIdAndDelete(req.params.id);

    // ✅ Log DELETE with full snapshot
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Deleted Payment Out: ${snapshot.invoiceNo}`,
      tableName: "paymentsOut",
      tableLabel: "Payment Out",
      recordId: snapshot._id,
      referenceNumber: snapshot.invoiceNo,
      previousData: snapshot, // full document
      description: `Payment out ${snapshot.invoiceNo} deleted — Supplier: ${snapshot.supplierName}, Amount: $${(snapshot.paidAmount || 0).toFixed(2)}${companyAccount ? `, Bank balance restored to $${companyAccount.totalAmount.toFixed(2)}` : ""}`,
      refField: "invoiceNo",
    });

    res.json({
      message: "Payment deleted successfully",
      payment: snapshot,
      updatedAccountBalance: companyAccount ? companyAccount.totalAmount : null,
    });
  } catch (error) {
    console.error("Error deleting payment:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

export default router;
