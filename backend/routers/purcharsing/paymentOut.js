import express from "express";
import PaymentsOut from "../../models/purcharsing/purchaseOut.js";
import CompanyAccount from "../../models/accounts/Destination.js";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";

const router = express.Router();

// GET all payments out with bank names
router.get("/", async (req, res) => {
  try {
    const payments = await PaymentsOut.find().sort({ createdAt: -1 });

    // Populate bank names
    const paymentsWithBankNames = await Promise.all(
      payments.map(async (payment) => {
        if (payment.bank) {
          try {
            const companyAccount = await CompanyAccount.findById(payment.bank);

            return {
              ...payment.toObject(),
              bankName: companyAccount ? companyAccount.name : "Unknown Bank",
              sourceBank: companyAccount ? companyAccount.name : "Unknown Bank", // Add sourceBank field
            };
          } catch (error) {
            return {
              ...payment.toObject(),
              bankName: "Unknown Bank",
              sourceBank: "Unknown Bank", // Add sourceBank field
            };
          }
        }

        return {
          ...payment.toObject(),
          bankName: "No Bank",
          sourceBank: "No Bank", // Add sourceBank field
        };
      }),
    );

    res.json(paymentsWithBankNames);
  } catch (error) {
    console.error("9. Error fetching payments:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// GET payment by ID with bank name
router.get("/:id", async (req, res) => {
  try {
    const payment = await PaymentsOut.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    // Populate bank name
    let paymentWithBankName = payment.toObject();

    if (payment.bank) {
      try {
        const companyAccount = await CompanyAccount.findById(payment.bank);

        paymentWithBankName.bankName = companyAccount
          ? companyAccount.name
          : "Unknown Bank";
        paymentWithBankName.sourceBank = companyAccount
          ? companyAccount.name
          : "Unknown Bank"; // Add sourceBank field
      } catch (error) {
        paymentWithBankName.bankName = "Unknown Bank";
        paymentWithBankName.sourceBank = "Unknown Bank"; // Add sourceBank field
      }
    } else {
      paymentWithBankName.bankName = "No Bank";
      paymentWithBankName.sourceBank = "No Bank"; // Add sourceBank field
    }

    res.json(paymentWithBankName);
  } catch (error) {
    console.error("10. Error fetching payment:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// POST new payment out
router.post("/", async (req, res) => {
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

    const existingPayment = await PaymentsOut.findOne({ invoiceNo });

    if (existingPayment) {
      return res.status(400).json({
        message: "Payment with this invoice number already exists",
      });
    }

    // Check if company account exists and has sufficient funds
    const companyAccount = await CompanyAccount.findById(bank);

    if (!companyAccount) {
      return res.status(404).json({
        message: "Company account not found",
      });
    }

    if (companyAccount.totalAmount < amount) {
      return res.status(400).json({
        message: "Insufficient funds in company account",
      });
    }

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

    const paymentWithBankName = {
      ...savedPayment.toObject(),
      bankName: companyAccount.name,
      sourceBank: companyAccount.name, // Add sourceBank field
    };

    res.status(201).json({
      message: "Payment created successfully",
      payment: paymentWithBankName,
      updatedAccountBalance: companyAccount.totalAmount,
    });
  } catch (error) {
    console.error("26. Error in POST /payments-out:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// UPDATE payment
router.put("/:id", protect, allowAdminOnly, async (req, res) => {
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

    const existingPayment = await PaymentsOut.findById(req.params.id);

    if (!existingPayment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    // Find the company account
    const targetBank = bank || existingPayment.bank;
    const companyAccount = await CompanyAccount.findById(targetBank);

    if (!companyAccount) {
      return res.status(404).json({
        message: "Company account not found",
      });
    }

    // Calculate the difference in amount
    const oldAmount = existingPayment.paidAmount;
    const newAmount = parseFloat(amount);
    const amountDifference = newAmount - oldAmount;

    if (companyAccount.totalAmount < amountDifference) {
      return res.status(400).json({
        message: "Insufficient funds in company account for this update",
      });
    }

    // Update the payment
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

    const paymentWithBankName = {
      ...updatedPayment.toObject(),
      bankName: companyAccount.name,
      sourceBank: companyAccount.name, // Add sourceBank field
    };

    res.json({
      message: "Payment updated successfully",
      payment: paymentWithBankName,
      updatedAccountBalance: companyAccount.totalAmount,
    });
  } catch (error) {
    console.error("23. Error updating payment:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// DELETE payment
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const deletedPayment = await PaymentsOut.findById(req.params.id);

    if (!deletedPayment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    const companyAccount = await CompanyAccount.findById(deletedPayment.bank);

    if (companyAccount) {
      companyAccount.totalAmount += deletedPayment.paidAmount;
      await companyAccount.save();
    }

    // Delete the payment
    await PaymentsOut.findByIdAndDelete(req.params.id);

    res.json({
      message: "Payment deleted successfully",
      payment: deletedPayment,
      updatedAccountBalance: companyAccount ? companyAccount.totalAmount : null,
    });
  } catch (error) {
    console.error("16. Error deleting payment:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

export default router;
