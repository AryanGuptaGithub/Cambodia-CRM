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

// Enhanced balance adjustment function
async function adjustBalances(
  transaction,
  session,
  isDelete = false,
  isUpdate = false,
  oldTransaction = null
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

  let adjustmentAmount = amount;
  let oldAmount = 0;
  let oldFinalAmount = 0;

  if (isUpdate && oldTransaction) {
    oldAmount = oldTransaction.amount || 0;
    oldFinalAmount = oldTransaction.finalAmount || oldAmount;
  }

  // For delete operations, we reverse the amount
  if (isDelete) {
    adjustmentAmount = -amount;
  }

  // Get category name for special handling
  let categoryName = "";
  if (categoryType && mongoose.Types.ObjectId.isValid(categoryType)) {
    const category = await CategoryType.findById(categoryType);
    categoryName = category ? category.name.toLowerCase() : "";
  }

  // Handle update case - calculate net difference
  if (isUpdate && oldTransaction) {
    const amountDifference = amount - oldAmount;
    const finalAmountDifference =
      (finalAmount || amount) - (oldFinalAmount || oldAmount);

    console.log(
      `Update: Old=${oldAmount}, New=${amount}, Difference=${amountDifference}`
    );
    console.log(
      `Final Amount: Old=${oldFinalAmount}, New=${finalAmount}, Difference=${finalAmountDifference}`
    );

    switch (transactionType) {
      case "deposit":
        if (!sourceAcc || !destAcc)
          throw new Error("Source or destination account missing for deposit");

        // For deposit: adjust source by amount difference, destination by finalAmount difference
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) - amountDifference;

        if (categoryName === "deposit" && finalAmount !== undefined) {
          destAcc.totalAmount =
            (destAcc.totalAmount || 0) + finalAmountDifference;
        } else {
          destAcc.totalAmount = (destAcc.totalAmount || 0) + amountDifference;
        }

        // Check for insufficient balance
        if (sourceAcc.totalAmount < 0) {
          throw new Error("Insufficient balance in source account");
        }

        await sourceAcc.save({ session });
        await destAcc.save({ session });
        break;

      case "withdraw":
        if (!sourceAcc || !destAcc)
          throw new Error("Source or destination account missing for withdraw");

        // For withdraw: adjust source by amount difference, destination by amount difference
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) - amountDifference;
        destAcc.totalAmount = (destAcc.totalAmount || 0) + amountDifference;

        // Check for insufficient balance
        if (sourceAcc.totalAmount < 0) {
          throw new Error("Insufficient balance in source account");
        }

        await sourceAcc.save({ session });
        await destAcc.save({ session });
        break;

      case "payment inward":
        if (!destAcc)
          throw new Error("Destination account missing for payment inward");

        destAcc.totalAmount = (destAcc.totalAmount || 0) + amountDifference;

        // Check for insufficient balance
        if (destAcc.totalAmount < 0) {
          throw new Error("Insufficient balance in destination account");
        }

        await destAcc.save({ session });
        break;

      case "payment outward":
        if (!sourceAcc)
          throw new Error("Source account missing for payment outward");

        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) - amountDifference;

        // Check for insufficient balance
        if (sourceAcc.totalAmount < 0) {
          throw new Error("Insufficient balance in source account");
        }

        await sourceAcc.save({ session });
        break;

      case "remittance":
        if (!sourceAcc)
          throw new Error("Source account missing for remittance");

        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) - amountDifference;

        // Check for insufficient balance
        if (sourceAcc.totalAmount < 0) {
          throw new Error("Insufficient balance in source account");
        }

        await sourceAcc.save({ session });
        break;

      default:
        // For sales and other transactions (cash sale, credit collection, etc.)
        if (destAcc) {
          destAcc.totalAmount = (destAcc.totalAmount || 0) + amountDifference;
          await destAcc.save({ session });
        }
        break;
    }
  } else {
    // CREATE/DELETE OPERATIONS (or category type changes)
    console.log(
      `Create/Delete: Amount=${adjustmentAmount}, Type=${transactionType}, Category=${categoryName}`
    );

    switch (transactionType) {
      case "deposit":
        if (!sourceAcc || !destAcc)
          throw new Error("Source or destination account missing for deposit");

        if (isDelete) {
          // Reverse deposit: add back to source, subtract from destination
          sourceAcc.totalAmount =
            (sourceAcc.totalAmount || 0) + adjustmentAmount;

          // For deposit reversal, use finalAmount if available
          if (categoryName === "deposit" && finalAmount) {
            destAcc.totalAmount =
              (destAcc.totalAmount || 0) - parseFloat(finalAmount);
          } else {
            destAcc.totalAmount = (destAcc.totalAmount || 0) - adjustmentAmount;
          }

          // Check for insufficient balance only when subtracting
          if (destAcc.totalAmount < 0) {
            throw new Error("Insufficient balance in destination account");
          }
        } else {
          // Normal deposit: subtract from source, add to destination
          sourceAcc.totalAmount =
            (sourceAcc.totalAmount || 0) - adjustmentAmount;

          // For deposit, use finalAmount instead of amount if available
          if (categoryName === "deposit" && finalAmount) {
            destAcc.totalAmount =
              (destAcc.totalAmount || 0) + parseFloat(finalAmount);
          } else {
            destAcc.totalAmount = (destAcc.totalAmount || 0) + adjustmentAmount;
          }

          // Check for insufficient balance only when subtracting
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
          sourceAcc.totalAmount =
            (sourceAcc.totalAmount || 0) + adjustmentAmount;
          destAcc.totalAmount = (destAcc.totalAmount || 0) - adjustmentAmount;

          if (destAcc.totalAmount < 0) {
            throw new Error("Insufficient balance in destination account");
          }
        } else {
          // Normal withdraw: subtract from source, add to destination
          sourceAcc.totalAmount =
            (sourceAcc.totalAmount || 0) - adjustmentAmount;
          destAcc.totalAmount = (destAcc.totalAmount || 0) + adjustmentAmount;

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
          destAcc.totalAmount = (destAcc.totalAmount || 0) - adjustmentAmount;
        } else {
          destAcc.totalAmount = (destAcc.totalAmount || 0) + adjustmentAmount;
        }

        await destAcc.save({ session });
        break;

      case "payment outward":
        if (!sourceAcc)
          throw new Error("Source account missing for payment outward");

        if (isDelete) {
          // Reverse: add back to source
          sourceAcc.totalAmount =
            (sourceAcc.totalAmount || 0) + adjustmentAmount;
        } else {
          // Normal: subtract from source
          sourceAcc.totalAmount =
            (sourceAcc.totalAmount || 0) - adjustmentAmount;
        }

        await sourceAcc.save({ session });
        break;

      case "remittance":
        if (!sourceAcc)
          throw new Error("Source account missing for remittance");

        if (isDelete) {
          // Reverse: add back to source
          sourceAcc.totalAmount =
            (sourceAcc.totalAmount || 0) + adjustmentAmount;
        } else {
          // Normal: subtract from source
          sourceAcc.totalAmount =
            (sourceAcc.totalAmount || 0) - adjustmentAmount;
        }

        await sourceAcc.save({ session });
        break;

      default:
        // For sales, cash sale, credit collection - only affect destination
        if (destAcc) {
          if (isDelete) {
            // Reverse: subtract from destination
            destAcc.totalAmount = (destAcc.totalAmount || 0) - adjustmentAmount;
          } else {
            // Normal: add to destination (money coming in)
            destAcc.totalAmount = (destAcc.totalAmount || 0) + adjustmentAmount;
          }

          await destAcc.save({ session });
        }
        break;
    }
  }
}
// Create transaction
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

// Update transaction
// Update transaction - CORRECTED VERSION
// Update transaction - COMPLETE VERSION WITH CATEGORY TYPE CHANGES
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

    // Determine new transaction type
    let transactionType = existingTransaction.transactionType;
    if (
      req.body.categoryType &&
      req.body.categoryType !== existingTransaction.categoryType.toString()
    ) {
      transactionType = await getTransactionType(req.body.categoryType);
    }

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

    // Get category names for both old and new transactions
    const oldCategory = await CategoryType.findById(
      existingTransaction.categoryType
    );
    const oldCategoryName = oldCategory ? oldCategory.name.toLowerCase() : "";

    const newCategory = updateData.categoryType
      ? await CategoryType.findById(updateData.categoryType)
      : oldCategory;
    const newCategoryName = newCategory
      ? newCategory.name.toLowerCase()
      : oldCategoryName;

    console.log(`Category Change: ${oldCategoryName} -> ${newCategoryName}`);

    // If category type changed significantly, we need special handling
    const categoryChanged = oldCategoryName !== newCategoryName;

    if (categoryChanged) {
      console.log(
        "Category type changed - performing full reversal and reapplication"
      );

      // STEP 1: Reverse the OLD transaction completely (like delete)
      await adjustBalances(existingTransaction, session, true);

      // STEP 2: Apply the NEW transaction completely (like create)
      await adjustBalances(
        {
          ...updateData,
          _id: existingTransaction._id,
          transactionType,
          source: updateData.source || existingTransaction.source,
          destination:
            updateData.destination || existingTransaction.destination,
          categoryType:
            updateData.categoryType || existingTransaction.categoryType,
        },
        session,
        false
      );
    } else {
      // Only amount/fields changed, use difference method
      console.log("Same category type - adjusting by difference");
      await adjustBalances(
        {
          ...updateData,
          _id: existingTransaction._id,
          transactionType,
          source: updateData.source || existingTransaction.source,
          destination:
            updateData.destination || existingTransaction.destination,
          categoryType:
            updateData.categoryType || existingTransaction.categoryType,
        },
        session,
        false, // isDelete = false
        true, // isUpdate = true
        existingTransaction // old transaction data
      );
    }

    // Update the transaction document
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
