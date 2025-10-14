import express from "express";
import Transaction from "../../models/accounts/Transaction.js";
import Destination from "../../models/accounts/Destination.js";
import CategoryType from "../../models/accounts/CategoryType.js";
import mongoose from "mongoose";
const router = express.Router();

// Helper function to determine transaction type from category
async function getTransactionType(categoryTypeId) {
  console.log(
    `🔵 getTransactionType called with categoryTypeId: ${categoryTypeId}`
  );
  const category = await CategoryType.findById(categoryTypeId);
  if (!category) throw new Error("Category type not found");

  const categoryName = category.name.toLowerCase();
  console.log(`🔵 Category name: ${categoryName}`);

  switch (categoryName) {
    case "deposit":
      return "deposit";
    case "withdraw":
      return "withdraw";
    case "remittance":
      return "remittance";
    case "payment inward":
      return "payment inward";
    case "payment outward":
      return "payment outward";
    case "sale":
    case "cash sale":
      return "sale";
    case "credit collection":
      return "credit collection";
    default:
      return "sale"; // default fallback
  }
}

// Balance adjustment function
async function adjustBalances(transaction, session, isDelete = false) {
  console.log(`🔵 adjustBalances called - isDelete: ${isDelete}`);
  const {
    transactionType,
    amount,
    source,
    destination,
    finalAmount,
    categoryType,
  } = transaction;

  console.log("📦 Transaction details:", {
    transactionType,
    amount,
    source,
    destination,
    finalAmount,
    categoryType,
    isDelete,
  });

  if (typeof amount !== "number" || amount <= 0) {
    console.log(`❌ Invalid amount: ${amount}`);
    throw new Error("Invalid amount in transaction");
  }

  console.log("🔵 Finding source and destination accounts...");
  const sourceAcc = source
    ? await Destination.findById(source).session(session)
    : null;
  const destAcc = destination
    ? await Destination.findById(destination).session(session)
    : null;

  console.log("📦 Account details:", {
    sourceAcc: sourceAcc
      ? { _id: sourceAcc._id, totalAmount: sourceAcc.totalAmount }
      : null,
    destAcc: destAcc
      ? { _id: destAcc._id, totalAmount: destAcc.totalAmount }
      : null,
  });

  // For delete operations, we reverse the amount
  const adjustmentAmount = isDelete ? -amount : amount;
  console.log(`🔵 Adjustment amount: ${adjustmentAmount}`);

  // Get category name for special handling
  let categoryName = "";
  if (categoryType && mongoose.Types.ObjectId.isValid(categoryType)) {
    const category = await CategoryType.findById(categoryType);
    categoryName = category ? category.name : "";
  }
  console.log(`🔵 Category name for special handling: ${categoryName}`);

  switch (transactionType) {
    case "deposit":
      console.log("🔵 Processing DEPOSIT transaction...");
      if (!sourceAcc || !destAcc)
        throw new Error("Source or destination account missing for deposit");

      if (isDelete) {
        console.log("🔵 Reversing DEPOSIT (delete operation)");
        // Reverse deposit: subtract from destination, add back to source
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) + adjustmentAmount;

        // For deposit reversal, use finalAmount if available
        if (categoryName.toLowerCase() === "deposit" && finalAmount) {
          console.log(
            `🔵 Using finalAmount for deposit reversal: ${finalAmount}`
          );
          destAcc.totalAmount =
            (destAcc.totalAmount || 0) - parseFloat(finalAmount);
        } else {
          destAcc.totalAmount = (destAcc.totalAmount || 0) - adjustmentAmount;
        }

        console.log(`📦 Source new balance: ${sourceAcc.totalAmount}`);
        console.log(`📦 Destination new balance: ${destAcc.totalAmount}`);

        // Check for insufficient balance only when subtracting
        if (destAcc.totalAmount < 0) {
          console.log(
            `❌ Insufficient balance in destination account: ${destAcc.totalAmount}`
          );
          throw new Error("Insufficient balance in destination account");
        }
      } else {
        console.log("🔵 Creating DEPOSIT (normal operation)");
        // Normal deposit: subtract from source, add to destination
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) - adjustmentAmount;

        // For deposit, use finalAmount instead of amount if available
        if (categoryName.toLowerCase() === "deposit" && finalAmount) {
          console.log(`🔵 Using finalAmount for deposit: ${finalAmount}`);
          destAcc.totalAmount =
            (destAcc.totalAmount || 0) + parseFloat(finalAmount);
        } else {
          destAcc.totalAmount = (destAcc.totalAmount || 0) + adjustmentAmount;
        }

        console.log(`📦 Source new balance: ${sourceAcc.totalAmount}`);
        console.log(`📦 Destination new balance: ${destAcc.totalAmount}`);

        // Check for insufficient balance only when subtracting
        if (sourceAcc.totalAmount < 0) {
          console.log(
            `❌ Insufficient balance in source account: ${sourceAcc.totalAmount}`
          );
          throw new Error("Insufficient balance in source account");
        }
      }

      console.log("🔵 Saving account balances...");
      await sourceAcc.save({ session });
      await destAcc.save({ session });
      console.log("✅ Account balances saved for DEPOSIT");
      break;

    case "withdraw":
      console.log("🔵 Processing WITHDRAW transaction...");
      if (!sourceAcc || !destAcc)
        throw new Error("Source or destination account missing for withdraw");

      if (isDelete) {
        console.log("🔵 Reversing WITHDRAW (delete operation)");
        // Reverse withdraw: add back to source, subtract from destination
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) + adjustmentAmount;
        destAcc.totalAmount = (destAcc.totalAmount || 0) - adjustmentAmount;

        if (destAcc.totalAmount < 0) {
          console.log(
            `❌ Insufficient balance in destination account: ${destAcc.totalAmount}`
          );
          throw new Error("Insufficient balance in destination account");
        }
      } else {
        console.log("🔵 Creating WITHDRAW (normal operation)");
        // Normal withdraw: subtract from source, add to destination
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) - adjustmentAmount;
        destAcc.totalAmount = (destAcc.totalAmount || 0) + adjustmentAmount;

        if (sourceAcc.totalAmount < 0) {
          console.log(
            `❌ Insufficient balance in source account: ${sourceAcc.totalAmount}`
          );
          throw new Error("Insufficient balance in source account");
        }
      }

      await sourceAcc.save({ session });
      await destAcc.save({ session });
      console.log("✅ Account balances saved for WITHDRAW");
      break;

    case "payment inward":
      console.log("🔵 Processing PAYMENT INWARD transaction...");
      if (!destAcc)
        throw new Error("Destination account missing for payment inward");

      if (isDelete) {
        destAcc.totalAmount = (destAcc.totalAmount || 0) - adjustmentAmount;
      } else {
        destAcc.totalAmount = (destAcc.totalAmount || 0) + adjustmentAmount;

        if (destAcc.totalAmount < 0) {
          console.log(
            `❌ Insufficient balance in destination account: ${destAcc.totalAmount}`
          );
          throw new Error("Insufficient balance in destination account");
        }
      }

      await destAcc.save({ session });
      console.log("✅ Account balance saved for PAYMENT INWARD");
      break;

    case "payment outward":
      console.log("🔵 Processing PAYMENT OUTWARD transaction...");
      if (!sourceAcc)
        throw new Error("Source account missing for payment outward");

      if (isDelete) {
        console.log("🔵 Reversing PAYMENT OUTWARD (delete operation)");
        // Reverse: add back to source
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) + adjustmentAmount;
      } else {
        console.log("🔵 Creating PAYMENT OUTWARD (normal operation)");
        // Normal: subtract from source
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) - adjustmentAmount;

        if (sourceAcc.totalAmount < 0) {
          console.log(
            `❌ Insufficient balance in source account: ${sourceAcc.totalAmount}`
          );
          throw new Error("Insufficient balance in source account");
        }
      }

      await sourceAcc.save({ session });
      console.log("✅ Account balance saved for PAYMENT OUTWARD");
      break;

    case "remittance":
      console.log("🔵 Processing REMITTANCE transaction...");
      if (!sourceAcc) throw new Error("Source account missing for remittance");

      if (isDelete) {
        console.log("🔵 Reversing REMITTANCE (delete operation)");
        // Reverse: subtract from source
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) + adjustmentAmount;

        if (sourceAcc.totalAmount < 0) {
          throw new Error("Insufficient balance in source account");
        }
      } else {
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) - adjustmentAmount;
      }

      await sourceAcc.save({ session });

      break;

    default:
      console.log(`🔵 Processing DEFAULT transaction type: ${transactionType}`);
      // For sales and other transactions, only adjust destination if it exists
      if (destAcc) {
        if (isDelete) {
          console.log("🔵 Reversing DEFAULT transaction (delete operation)");
          // Reverse: add back to destination
          destAcc.totalAmount = (destAcc.totalAmount || 0) + adjustmentAmount;
          console.log(`📦 Destination new balance: ${destAcc.totalAmount}`);
        } else {
          console.log("🔵 Creating DEFAULT transaction (normal operation)");
          // Normal: For sales, we ADD to destination account (money coming in)
          destAcc.totalAmount = (destAcc.totalAmount || 0) + adjustmentAmount;
          console.log(`📦 Destination new balance: ${destAcc.totalAmount}`);

          // For sales transactions, we don't check for insufficient balance since we're ADDING money
          // Only check if we're subtracting (which we don't do for sales)
        }

        console.log("🔵 Saving destination account balance...");
        await destAcc.save({ session });
        console.log("✅ Destination account balance saved");
      } else {
        console.log(
          "ℹ️  No destination account to adjust for DEFAULT transaction"
        );
      }
  }

  console.log("✅ adjustBalances completed successfully");
}

// Create transaction
router.post("/transaction", async (req, res) => {
  console.log("🔵 POST /transaction - Starting transaction creation");
  const session = await mongoose.startSession();
  console.log("🔵 MongoDB session started");

  try {
    console.log("🔵 Starting transaction...");
    session.startTransaction();
    console.log("🔵 Transaction started");

    console.log("🔵 Parsing request body...");
    const {
      categoryType,
      source,
      destination,
      supplier,
      amount,
      exchangeLoss = 0,
      finalAmount,
      date,
      invoiceDate,
      invoiceNumber,
      customerName,
      customerAddress,
      accountType,
      description,
      remarks,
    } = req.body;

    console.log("📦 Request body data:", {
      categoryType,
      source,
      destination,
      supplier,
      amount,
      exchangeLoss,
      finalAmount,
      date,
      invoiceDate,
      invoiceNumber,
      customerName,
      customerAddress,
      accountType,
      description,
      remarks,
    });

    console.log("🔵 Validating ObjectIds...");
    const validateObjectId = (id, name) => {
      console.log(`🔵 Validating ${name}: ${id}`);
      if (id && !mongoose.Types.ObjectId.isValid(id)) {
        console.log(`❌ Invalid ${name} ID: ${id}`);
        throw new Error(`Invalid ${name} ID`);
      }
      console.log(`✅ ${name} ID is valid`);
    };

    validateObjectId(categoryType, "categoryType");
    validateObjectId(source, "source");
    validateObjectId(destination, "destination");
    validateObjectId(supplier, "supplier");
    console.log("✅ All ObjectIds validated successfully");

    console.log("🔵 Determining transaction type from category...");
    const transactionType = await getTransactionType(categoryType);
    console.log(`✅ Transaction type determined: ${transactionType}`);

    console.log("🔵 Creating transaction data object...");
    const transactionData = {
      categoryType,
      source,
      destination,
      supplier,
      transactionType,
      amount: parseFloat(amount),
      exchangeLoss: parseFloat(exchangeLoss) || 0,
      finalAmount: parseFloat(finalAmount) || parseFloat(amount),
      date: new Date(date),
      invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
      invoiceNumber,
      customerName,
      customerAddress,
      accountType,
      description,
      remarks,
    };

    console.log("📦 Transaction data prepared:", transactionData);

    console.log("🔵 Saving transaction to database...");
    const transaction = new Transaction(transactionData);
    await transaction.save({ session });
    console.log(
      `✅ Transaction saved successfully with ID: ${transaction._id}`
    );

    console.log("🔵 Adjusting account balances...");
    await adjustBalances(transaction, session, false);
    console.log("✅ Account balances adjusted successfully");

    console.log("🔵 Committing transaction...");
    await session.commitTransaction();
    console.log("✅ Transaction committed successfully");

    console.log("🔵 Ending session...");
    session.endSession();
    console.log("✅ Session ended");

    console.log("🔵 Populating transaction with related data...");
    const populatedTransaction = await Transaction.findById(transaction._id)
      .populate("categoryType", "name")
      .populate("source", "name totalAmount")
      .populate("destination", "name totalAmount")
      .populate("supplier", "name");

    console.log("📦 Populated transaction:", populatedTransaction);

    res.status(201).json({
      success: true,
      data: populatedTransaction,
      message: "Transaction created successfully",
    });
  } catch (error) {
    console.error("❌ Error occurred in transaction creation:");
    console.error("❌ Error message:", error.message);
    console.error("❌ Error stack:", error.stack);

    console.log("🔵 Attempting to abort transaction...");
    await session.abortTransaction();
    console.log("✅ Transaction aborted");

    console.log("🔵 Ending session after error...");
    session.endSession();
    console.log("✅ Session ended after error");

    console.log("❌ Sending error response to client");
    res.status(400).json({
      success: false,
      message: error.message,
    });
    console.log("✅ Error response sent");
  }
});

// ... rest of your routes remain the same (GET, PUT, DELETE)
// Get all transactions with pagination and filtering
router.get("/transaction", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      accountType,
      search,
      startDate,
      endDate,
    } = req.query;

    const query = {};

    if (accountType) query.accountType = accountType;

    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { customerName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query)
      .populate("categoryType", "name")
      .populate("source", "name totalAmount")
      .populate("destination", "name totalAmount")
      .populate("supplier", "name")
      .sort({ date: -1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments(query);

    // ✅ Get full list of destinations
    const destinations = await Destination.find();

    res.json({
      success: true,
      data: transactions,
      destinations,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total,
    });
  } catch (error) {
    console.error("Transaction fetch error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get single transaction by ID
router.get("/transaction/:id", async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate("categoryType", "name")
      .populate("source", "name totalAmount")
      .populate("destination", "name totalAmount")
      .populate("supplier", "name");

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    res.json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Update transaction
router.put("/transaction/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid transaction ID",
      });
    }

    // Find existing transaction
    const existingTransaction = await Transaction.findById(id).session(session);
    if (!existingTransaction) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // First reverse the old balances
    await adjustBalances(existingTransaction, session, true);

    // Determine new transaction type if category changed
    let transactionType = existingTransaction.transactionType;
    if (
      req.body.categoryType &&
      req.body.categoryType !== existingTransaction.categoryType.toString()
    ) {
      transactionType = await getTransactionType(req.body.categoryType);
    }

    // Prepare update data
    const updateData = {
      ...req.body,
      transactionType,
      amount: parseFloat(req.body.amount || existingTransaction.amount),
      exchangeLoss: parseFloat(
        req.body.exchangeLoss || existingTransaction.exchangeLoss
      ),
      finalAmount: parseFloat(
        req.body.finalAmount || existingTransaction.finalAmount
      ),
    };

    // Update transaction
    const transaction = await Transaction.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
      session,
    });

    // Apply new balances
    await adjustBalances(transaction, session, false);

    await session.commitTransaction();
    session.endSession();

    // Populate and return
    const populatedTransaction = await Transaction.findById(transaction._id)
      .populate("categoryType", "name")
      .populate("source", "name totalAmount")
      .populate("destination", "name totalAmount")
      .populate("supplier", "name");

    res.json({
      success: true,
      data: populatedTransaction,
      message: "Transaction updated successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// Delete single transaction
router.delete("/transaction/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid transaction ID",
      });
    }

    const transaction = await Transaction.findById(id).session(session);
    if (!transaction) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // Reverse the balances
    await adjustBalances(transaction, session, true);
    await Transaction.findByIdAndDelete(id, { session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: "Transaction deleted and balances updated successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting transaction:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete transaction",
      error: error.message,
    });
  }
});

// Bulk delete transactions
router.delete("/transactions", async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No IDs provided",
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const invalidIds = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Invalid transaction ID(s): ${invalidIds.join(", ")}`,
      });
    }

    const transactions = await Transaction.find({ _id: { $in: ids } }).session(
      session
    );
    if (transactions.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "No transactions found",
      });
    }

    for (const tx of transactions) {
      await adjustBalances(tx, session, true);
    }

    const result = await Transaction.deleteMany({ _id: { $in: ids } }).session(
      session
    );

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: `${result.deletedCount} transaction(s) deleted and balances updated successfully`,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting transactions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete transactions",
      error: error.message,
    });
  }
});

export default router;
