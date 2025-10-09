import express from "express";
import PaymentsOut from "../../models/purcharsing/purchaseOut.js";

const router = express.Router();

// GET all payments out
router.post("/payments-out", async (req, res) => {
  try {
    const {
      paymentDate,
      invoiceNo,
      invoiceDate,
      supplierName,
      amount, // This is paidAmount from frontend
      invoiceAmount,
      bank,
      remarks,
    } = req.body;

    // Check if payment with same invoice number already exists
    const existingPayment = await PaymentsOut.findOne({ invoiceNo });
    if (existingPayment) {
      return res.status(400).json({
        message: "Payment with this invoice number already exists",
      });
    }

    // Create new payment - map frontend fields to backend model
    const newPayment = new PaymentsOut({
      paymentDate,
      invoiceNo,
      invoiceDate,
      supplierName,
      invoiceAmount: parseFloat(invoiceAmount),
      paidAmount: parseFloat(amount), // Map frontend 'amount' to 'paidAmount'
      bank: bank || "",
      remarks: remarks || "",
    });

    const savedPayment = await newPayment.save();

    res.status(201).json({
      message: "Payment created successfully",
      payment: savedPayment,
    });
  } catch (error) {
    console.error("Error creating payment:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// GET all payments
router.get("/payments-out", async (req, res) => {
  try {
    const payments = await PaymentsOut.find().sort({ createdAt: -1 });
    res.json(payments);
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// GET payment by ID
router.get("/payments-out/:id", async (req, res) => {
  try {
    const payment = await PaymentsOut.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }
    res.json(payment);
  } catch (error) {
    console.error("Error fetching payment:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// UPDATE payment
router.put("/payments-out/:id", async (req, res) => {
  try {
    const {
      paymentDate,
      invoiceNo,
      invoiceDate,
      supplierName,
      amount, // This is paidAmount from frontend
      invoiceAmount,
      bank,
      remarks,
    } = req.body;

    const updatedPayment = await PaymentsOut.findByIdAndUpdate(
      req.params.id,
      {
        paymentDate,
        invoiceNo,
        invoiceDate,
        supplierName,
        invoiceAmount: parseFloat(invoiceAmount),
        paidAmount: parseFloat(amount), // Map frontend 'amount' to 'paidAmount'
        bank: bank || "",
        remarks: remarks || "",
      },
      { new: true, runValidators: true }
    );

    if (!updatedPayment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.json({
      message: "Payment updated successfully",
      payment: updatedPayment,
    });
  } catch (error) {
    console.error("Error updating payment:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// DELETE payment
router.delete("/payments-out/:id", async (req, res) => {
  try {
    const deletedPayment = await PaymentsOut.findByIdAndDelete(req.params.id);

    if (!deletedPayment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.json({
      message: "Payment deleted successfully",
      payment: deletedPayment,
    });
  } catch (error) {
    console.error("Error deleting payment:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

export default router;
