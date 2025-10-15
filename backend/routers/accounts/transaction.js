import express from "express";
import Transaction from "../../models/accounts/Transaction.js";
import Destination from "../../models/accounts/Destination.js";
import CategoryType from "../../models/accounts/CategoryType.js";
import mongoose from "mongoose";
const router = express.Router();

// Helper function to determine transaction type from category
async function getTransactionType(categoryTypeId) {
  const category = await CategoryType.findById(categoryTypeId);
  if (!category) throw new Error("Category type not found");

  const categoryName = category.name.toLowerCase();

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
      return "sale";
  }
}

// Enhanced balance adjustment function - CORRECTED FOR DEPOSIT
async function adjustBalances(
  transaction,
  session,
  isDelete = false
) {
  const {
    transactionType,
    amount,
    source,
    destination,
    finalAmount,
    categoryType,
  } = transaction;

  if (typeof amount !== "number" || amount <= 0) {
    throw new Error("Invalid amount in transaction");
  }

  const sourceAcc = source
    ? await Destination.findById(source).session(session)
    : null;
  const destAcc = destination
    ? await Destination.findById(destination).session(session)
    : null;

  // Get category name for special handling
  let categoryName = "";
  if (categoryType && mongoose.Types.ObjectId.isValid(categoryType)) {
    const category = await CategoryType.findById(categoryType);
    categoryName = category ? category.name.toLowerCase() : "";
  }

  console.log(`Balance Adjustment:
    Type: ${transactionType}
    Category: ${categoryName}
    Amount: ${amount}
    Final Amount: ${finalAmount}
    Source: ${sourceAcc?.name} (${sourceAcc?.totalAmount})
    Destination: ${destAcc?.name} (${destAcc?.totalAmount})
    Operation: ${isDelete ? 'DELETE' : 'CREATE'}`);

  switch (transactionType) {
    case "deposit":
      if (!sourceAcc || !destAcc)
        throw new Error("Source or destination account missing for deposit");

      if (isDelete) {
        // Reverse deposit: add back FULL AMOUNT to source, subtract FINAL AMOUNT from destination
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) + amount;
        
        // For deposit reversal, ALWAYS use finalAmount for destination
        const destinationAdjustment = finalAmount !== undefined ? finalAmount : amount;
        destAcc.totalAmount = (destAcc.totalAmount || 0) - destinationAdjustment;
        
        console.log(`Deposit REVERSED: Source +${amount}, Destination -${destinationAdjustment}`);
      } else {
        // Normal deposit: subtract FULL AMOUNT from source, add FINAL AMOUNT to destination
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) - amount;
        
        // For deposit, ALWAYS use finalAmount for destination if available
        const destinationAdjustment = finalAmount !== undefined ? finalAmount : amount;
        destAcc.totalAmount = (destAcc.totalAmount || 0) + destinationAdjustment;
        
        console.log(`Deposit APPLIED: Source -${amount}, Destination +${destinationAdjustment}`);
        
        // Check for insufficient balance
        if (sourceAcc.totalAmount < 0) {
          throw new Error("Insufficient balance in source account");
        }
      }

      await sourceAcc.save({ session });
      await destAcc.save({ session });
      break;

    case "withdraw":
      if (!sourceAcc || !destAcc)
        throw new Error("Source or destination account missing for withdraw");

      if (isDelete) {
        // Reverse withdraw: add back to source, subtract from destination
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) + amount;
        destAcc.totalAmount = (destAcc.totalAmount || 0) - amount;
        console.log(`Withdraw REVERSED: Source +${amount}, Destination -${amount}`);
      } else {
        // Normal withdraw: subtract from source, add to destination
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) - amount;
        destAcc.totalAmount = (destAcc.totalAmount || 0) + amount;
        console.log(`Withdraw APPLIED: Source -${amount}, Destination +${amount}`);
        
        if (sourceAcc.totalAmount < 0) {
          throw new Error("Insufficient balance in source account");
        }
      }

      await sourceAcc.save({ session });
      await destAcc.save({ session });
      break;

    case "payment inward":
      if (!destAcc)
        throw new Error("Destination account missing for payment inward");

      if (isDelete) {
        destAcc.totalAmount = (destAcc.totalAmount || 0) - amount;
        console.log(`Payment Inward REVERSED: Destination -${amount}`);
      } else {
        destAcc.totalAmount = (destAcc.totalAmount || 0) + amount;
        console.log(`Payment Inward APPLIED: Destination +${amount}`);
      }

      await destAcc.save({ session });
      break;

    case "payment outward":
      if (!sourceAcc)
        throw new Error("Source account missing for payment outward");

      if (isDelete) {
        // Reverse: add back to source
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) + amount;
        console.log(`Payment Outward REVERSED: Source +${amount}`);
      } else {
        // Normal: subtract from source
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) - amount;
        console.log(`Payment Outward APPLIED: Source -${amount}`);
      }

      await sourceAcc.save({ session });
      break;

    case "remittance":
      if (!sourceAcc)
        throw new Error("Source account missing for remittance");

      if (isDelete) {
        // Reverse: add back to source
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) + amount;
        console.log(`Remittance REVERSED: Source +${amount}`);
      } else {
        // Normal: subtract from source
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) - amount;
        console.log(`Remittance APPLIED: Source -${amount}`);
      }

      await sourceAcc.save({ session });
      break;

    default:
      // For sales, cash sale, credit collection - only affect destination with amount
      if (destAcc) {
        if (isDelete) {
          // Reverse: subtract from destination
          destAcc.totalAmount = (destAcc.totalAmount || 0) - amount;
          console.log(`Sale REVERSED: Destination -${amount}`);
        } else {
          // Normal: add to destination (money coming in)
          destAcc.totalAmount = (destAcc.totalAmount || 0) + amount;
          console.log(`Sale APPLIED: Destination +${amount}`);
        }

        await destAcc.save({ session });
      }
      break;
  }

  console.log(`Balance Adjustment Complete:
    Source: ${sourceAcc?.name} = ${sourceAcc?.totalAmount}
    Destination: ${destAcc?.name} = ${destAcc?.totalAmount}`);
}

// Create transaction - UPDATED TO ENSURE FINAL AMOUNT IS CALCULATED
router.post("/transaction", async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

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

    // Validate ObjectIds
    const validateObjectId = (id, name) => {
      if (id && !mongoose.Types.ObjectId.isValid(id)) {
        throw new Error(`Invalid ${name} ID`);
      }
    };

    validateObjectId(categoryType, "categoryType");
    validateObjectId(source, "source");
    validateObjectId(destination, "destination");
    validateObjectId(supplier, "supplier");

    const transactionType = await getTransactionType(categoryType);

    // Calculate final amount for deposit transactions
    let calculatedFinalAmount = parseFloat(finalAmount) || parseFloat(amount);
    if (transactionType === "deposit") {
      const exchangeLossValue = parseFloat(exchangeLoss) || 0;
      calculatedFinalAmount = parseFloat(amount) - exchangeLossValue;
    }

    const transactionData = {
      categoryType,
      source,
      destination,
      supplier,
      transactionType,
      amount: parseFloat(amount),
      exchangeLoss: parseFloat(exchangeLoss) || 0,
      finalAmount: calculatedFinalAmount,
      date: new Date(date),
      invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
      invoiceNumber,
      customerName,
      customerAddress,
      accountType,
      description,
      remarks,
    };

    console.log(`Creating Transaction:
      Amount: ${transactionData.amount}
      Exchange Loss: ${transactionData.exchangeLoss}
      Final Amount: ${transactionData.finalAmount}`);

    const transaction = new Transaction(transactionData);
    await transaction.save({ session });

    await adjustBalances(transaction, session, false);

    await session.commitTransaction();
    session.endSession();

    const populatedTransaction = await Transaction.findById(transaction._id)
      .populate("categoryType", "name")
      .populate("source", "name totalAmount")
      .populate("destination", "name totalAmount")
      .populate("supplier", "name");

    res.status(201).json({
      success: true,
      data: populatedTransaction,
      message: "Transaction created successfully",
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

// Get all transactions with pagination and filtering
router.get("/transaction", async (req, res) => {
  try {
    const transactions = await Transaction.find({})
      .populate("categoryType", "name")
      .populate("source", "name totalAmount")
      .populate("destination", "name totalAmount")
      .populate("supplier", "name")
      .sort({ date: -1, createdAt: -1 });

    const destinations = await Destination.find();
    const total = transactions.length;

    res.json({
      success: true,
      data: transactions,
      destinations,
      totalPages: 1,
      currentPage: 1,
      total,
    });
  } catch (error) {
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

// Update transaction - CORRECTED FOR FINAL AMOUNT HANDLING
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

    const existingTransaction = await Transaction.findById(id).session(session);

    if (!existingTransaction) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // Check if category type is changing
    const categoryTypeChanged =
      req.body.categoryType &&
      req.body.categoryType !== existingTransaction.categoryType.toString();

    let newTransactionType = existingTransaction.transactionType;
    if (categoryTypeChanged) {
      newTransactionType = await getTransactionType(req.body.categoryType);
    }

    console.log(`=== TRANSACTION UPDATE START ===`);
    console.log(`Existing: ${existingTransaction.transactionType} (${existingTransaction.amount})`);
    console.log(`New: ${newTransactionType} (${req.body.amount})`);
    console.log(`Category Changed: ${categoryTypeChanged}`);

    // STEP 1: COMPLETELY REVERSE THE OLD TRANSACTION
    console.log("STEP 1: Reversing OLD transaction completely");
    await adjustBalances(existingTransaction, session, true);

    // STEP 2: APPLY THE NEW TRANSACTION
    console.log("STEP 2: Applying NEW transaction");

    // Calculate final amount for deposit transactions
    let calculatedFinalAmount = parseFloat(req.body.finalAmount) || parseFloat(req.body.amount) || existingTransaction.finalAmount;
    if (newTransactionType === "deposit") {
      const amountValue = parseFloat(req.body.amount) || existingTransaction.amount;
      const exchangeLossValue = parseFloat(req.body.exchangeLoss) || existingTransaction.exchangeLoss || 0;
      calculatedFinalAmount = amountValue - exchangeLossValue;
    }

    const updateData = {
      ...req.body,
      transactionType: newTransactionType,
      amount: parseFloat(req.body.amount || existingTransaction.amount),
      exchangeLoss: parseFloat(
        req.body.exchangeLoss || existingTransaction.exchangeLoss
      ),
      finalAmount: calculatedFinalAmount,
    };

    console.log(`Update Data:
      Amount: ${updateData.amount}
      Exchange Loss: ${updateData.exchangeLoss}
      Final Amount: ${updateData.finalAmount}`);

    // For category changes, ensure proper source/destination handling
    if (categoryTypeChanged) {
      const newCategory = await CategoryType.findById(req.body.categoryType);
      const newCategoryName = newCategory ? newCategory.name.toLowerCase() : "";

      console.log(`Category changed to: ${newCategoryName}`);

      // Clear inappropriate fields based on new category
      if (newCategoryName === "cash sale" || newCategoryName === "sale" || newCategoryName === "credit collection") {
        // Sales categories only need destination
        updateData.source = undefined;
        if (!updateData.destination) {
          throw new Error("Destination account is required for sales transactions");
        }
      } else if (newCategoryName === "remittance" || newCategoryName === "payment outward") {
        // These categories need source only
        updateData.destination = undefined;
        if (!updateData.source) {
          throw new Error("Source account is required for this transaction type");
        }
      } else if (newCategoryName === "payment inward") {
        // Payment inward needs destination only
        updateData.source = undefined;
        if (!updateData.destination) {
          throw new Error("Destination account is required for payment inward");
        }
      }
      // For deposit/withdraw, both source and destination should be provided
    }

    const newTransactionData = {
      ...updateData,
      _id: existingTransaction._id,
      transactionType: newTransactionType,
    };

    await adjustBalances(newTransactionData, session, false);

    // STEP 3: UPDATE THE TRANSACTION DOCUMENT
    console.log("STEP 3: Updating transaction document");
    const transaction = await Transaction.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
      session,
    });

    await session.commitTransaction();
    session.endSession();

    const populatedTransaction = await Transaction.findById(transaction._id)
      .populate("categoryType", "name")
      .populate("source", "name totalAmount")
      .populate("destination", "name totalAmount")
      .populate("supplier", "name");

    console.log(`=== TRANSACTION UPDATE COMPLETE ===`);

    res.json({
      success: true,
      data: populatedTransaction,
      message: "Transaction updated successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Transaction update error:", error);
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
    res.status(500).json({
      success: false,
      message: "Failed to delete transactions",
      error: error.message,
    });
  }
});

export default router;