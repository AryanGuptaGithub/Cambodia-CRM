import express from "express";
import Payroll from "../../models/Hrm/Payroll.js";
import Staff from "../../models/staffMember/staff.js";
import Account from "../../models/accounts/Destination.js";
import mongoose from "mongoose";

const router = express.Router();

const generateNextPayrollCode = async () => {
  const latestPayroll = await Payroll.findOne({}).sort({ createdAt: -1 });
  let nextNumber = 1;

  if (latestPayroll && latestPayroll.payrollCode) {
    const matches = latestPayroll.payrollCode.match(/PR-(\d+)/);
    if (matches && matches[1]) {
      nextNumber = parseInt(matches[1]) + 1;
    }
  }

  return `PR-${nextNumber.toString().padStart(4, "0")}`;
};

// Helper function to update account balance
const updateAccountBalance = async (
  accountId,
  amount,
  operation = "subtract",
  session = null
) => {
  try {
    const account = await Account.findById(accountId).session(session);
    if (!account) {
      throw new Error(`Account with ID ${accountId} not found`);
    }

    if (operation === "subtract") {
      if (account.totalAmount < amount) {
        throw new Error(
          `Insufficient balance in account ${account.name}. Available: ${account.totalAmount}, Required: ${amount}`
        );
      }
      account.totalAmount -= amount;
    } else if (operation === "add") {
      account.totalAmount += amount;
    }

    await account.save({ session });
    return account;
  } catch (error) {
    console.error("❌ Error updating account balance:", error);
    throw error;
  }
};

// ==================== GET ALL PAYROLLS ====================
router.get("/payrolls", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      status = "",
      period = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const matchConditions = { enabled: true };
    console.log('req', req.query);
    // -----------------------------
    // STATUS FILTER
    // -----------------------------
    if (status && status !== "all") {
      matchConditions.status = status;
    }

    // -----------------------------
    // PERIOD FILTER (FIXED HERE)
    // -----------------------------
    if (period) {
      // Example: 2025-YTD → match all like "2025-*"
      if (period.endsWith("-YTD")) {
        const year = period.split("-")[0];
        matchConditions.period = { $regex: `^${year}-`, $options: "i" };
      }
      // Specific period like "2025-10"
      else if (period !== "all") {
        matchConditions.period = period;
      }
    }

    // -----------------------------
    // SEARCH FILTER
    // -----------------------------
    let searchConditions = {};
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");

      const matchingStaff = await Staff.find({
        $or: [
          { medicalRepName: searchRegex },
          { teamName: searchRegex },
          { contactNo: searchRegex },
          { email: searchRegex },
        ],
      }).select("_id");

      const staffIds = matchingStaff.map((s) => s._id);

      searchConditions = {
        $or: [
          { payrollCode: searchRegex },
          { paymentMethod: searchRegex },
          { employeeId: { $in: staffIds } },
        ],
      };
    }

    // -----------------------------
    // FINAL QUERY CONDITIONS
    // -----------------------------
    const finalConditions = {
      ...matchConditions,
      ...(Object.keys(searchConditions).length > 0 ? searchConditions : {}),
    };

    // Sorting
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // -----------------------------
    // FETCH PAYROLLS
    // -----------------------------
    const payrolls = await Payroll.find(finalConditions)
      .populate(
        "employeeId",
        "medicalRepName teamName contactNo email date enabled MRId"
      )
      .populate("source", "name code totalAmount")
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // -----------------------------
    // TRANSFORM PAYROLL DATA
    // -----------------------------
    const transformedPayrolls = payrolls.map((payroll) => {
      const payrollObj = { ...payroll };

      if (
        payrollObj.employeeId &&
        typeof payrollObj.employeeId === "object" &&
        payrollObj.employeeId._id
      ) {
        payrollObj.employeeName = payrollObj.employeeId.medicalRepName;
        payrollObj.teamName = payrollObj.employeeId.teamName;
        payrollObj.contactNo = payrollObj.employeeId.contactNo;
        payrollObj.email = payrollObj.employeeId.email;
        payrollObj.joiningDate = payrollObj.employeeId.date;
        payrollObj.employeeEnabled = payrollObj.employeeId.enabled;
        payrollObj.MRId = payrollObj.employeeId.MRId;
      } else {
        payrollObj.employeeName = "Unknown";
        payrollObj.teamName = "Unknown";
        payrollObj.contactNo = "N/A";
        payrollObj.email = "N/A";
        payrollObj.joiningDate = null;
        payrollObj.employeeEnabled = false;
        payrollObj.MRId = "N/A";
      }

      return payrollObj;
    });

    // Count
    const total = await Payroll.countDocuments(finalConditions);
    const totalPages = Math.ceil(total / limitNum);
    const nextPayrollCode = await generateNextPayrollCode();

    res.status(200).json({
      success: true,
      data: transformedPayrolls,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: total,
        itemsPerPage: limitNum,
      },
      nextPayrollCode,
    });
  } catch (error) {
    console.error("❌ Error in payrolls API:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch payrolls",
      error: error.message,
    });
  }
});

// ==================== GET SINGLE PAYROLL BY ID ====================
router.get("/payrolls/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const payroll = await Payroll.findById(id)
      .populate("employeeId", "medicalRepName teamName contactNo email")
      .populate("source", "name code totalAmount"); // Populate source account

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll not found",
      });
    }

    // Transform the response to include employee data in a more accessible format
    const payrollData = payroll.toObject();
    if (payrollData.employeeId) {
      payrollData.employeeName = payrollData.employeeId.medicalRepName;
      payrollData.teamName = payrollData.employeeId.teamName;
      payrollData.contactNo = payrollData.employeeId.contactNo;
      payrollData.email = payrollData.employeeId.email;
    }

    res.status(200).json({
      success: true,
      data: payrollData,
    });
  } catch (error) {
    console.error("❌ Error fetching payroll:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid payroll ID",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to fetch payroll",
      error: error.message,
    });
  }
});

// ==================== CREATE NEW PAYROLL ====================
router.post("/payrolls", async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    const {
      employeeId,
      period,
      basicSalary,
      allowances,
      deductions,
      status,
      paymentMethod,
      bankAccount,
      paymentDate,
      remarks,
      source, // Source account ID
    } = req.body;
    // Validate required fields
    if (!employeeId || !period || !basicSalary) {
      return res.status(400).json({
        success: false,
        message: "Employee ID, period, and basic salary are required",
      });
    }

    // Validate source account
    if (!source) {
      return res.status(400).json({
        success: false,
        message: "Source account is required",
      });
    }

    // Validate period format (YYYY-MM)
    const periodRegex = /^\d{4}-\d{2}$/;
    if (!periodRegex.test(period)) {
      return res.status(400).json({
        success: false,
        message: "Period must be in YYYY-MM format",
      });
    }

    // Check if employee exists
    const employee = await Staff.findById(employeeId).session(session);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // Check if source account exists
    const sourceAccount = await Account.findById(source).session(session);
    if (!sourceAccount) {
      return res.status(404).json({
        success: false,
        message: "Source account not found",
      });
    }

    // Check for duplicate payroll (same employee and period)
    const existingPayroll = await Payroll.findOne({
      employeeId,
      period,
    }).session(session);

    if (existingPayroll) {
      return res.status(409).json({
        success: false,
        message:
          "Payroll record already exists for this employee in the selected period",
      });
    }

    // Parse numeric values
    const basicSalaryNum = parseFloat(basicSalary);
    const deductionsNum = parseFloat(deductions) || 0;

    // Validate allowances array and calculate total allowance
    let totalAllowance = 0;
    let processedAllowances = [];
    if (allowances && Array.isArray(allowances)) {
      for (let allowance of allowances) {
        if (!allowance.type || allowance.amount === undefined) {
          return res.status(400).json({
            success: false,
            message: "Each allowance must have type and amount",
          });
        }

        const allowanceAmount = parseFloat(allowance.amount);
        if (isNaN(allowanceAmount) || allowanceAmount < 0) {
          return res.status(400).json({
            success: false,
            message: "Allowance amount must be a valid non-negative number",
          });
        }

        totalAllowance += allowanceAmount;
        processedAllowances.push({
          type: allowance.type.trim(),
          amount: allowanceAmount,
        });
      }
    }

    // Calculate net salary (required field)
    const netSalary = basicSalaryNum + totalAllowance - deductionsNum;

    // Validate that net salary is not negative
    if (netSalary < 0) {
      return res.status(400).json({
        success: false,
        message:
          "Net salary cannot be negative. Please check deductions and allowances.",
      });
    }

    // Generate payroll code
    const payrollCode = await generateNextPayrollCode();

    // Create payroll object with ALL required fields
    const payrollData = {
      employeeId,
      period,
      basicSalary: basicSalaryNum,
      allowances: processedAllowances,
      totalAllowance: totalAllowance,
      deductions: deductionsNum,
      netSalary: netSalary,
      status: status || "pending",
      paymentMethod: paymentMethod || "bank",
      bankAccount: bankAccount || "",
      paymentDate: paymentDate || null,
      remarks: remarks || "",
      payrollCode: payrollCode,
      source: source, // Store source account reference
      createdBy: req.user?._id,
    };

    // Create payroll
    const payroll = new Payroll(payrollData);
    await payroll.save({ session });

    // Update source account balance (subtract net salary)
    await updateAccountBalance(source, netSalary, "subtract", session);

    // Commit transaction
    await session.commitTransaction();

    // Populate employee details in response
    await payroll.populate(
      "employeeId",
      "medicalRepName teamName contactNo email"
    );
    await payroll.populate("source", "name code totalAmount");

    // Transform the response
    const responseData = payroll.toObject();
    if (responseData.employeeId) {
      responseData.employeeName = responseData.employeeId.medicalRepName;
      responseData.teamName = responseData.employeeId.teamName;
    }

    res.status(201).json({
      success: true,
      message: "Payroll created successfully",
      data: responseData,
    });
  } catch (error) {
    // Only abort transaction if it was started
    if (session.transaction?.isActive) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error("❌ Error aborting transaction:", abortError);
      }
    }
    console.error("❌ Payroll creation error:", error);

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: messages,
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Payroll record already exists for this period",
      });
    }

    if (error.message.includes("Insufficient balance")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create payroll",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
});

// ==================== UPDATE PAYROLL ====================
router.put("/payrolls/:id", async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    const { id } = req.params;
    const {
      basicSalary,
      allowances,
      deductions,
      status,
      paymentMethod,
      bankAccount,
      paymentDate,
      remarks,
      enabled,
      source, // New source account (if changing)
    } = req.body;

    // Find payroll with current source account
    const payroll = await Payroll.findById(id)
      .populate("source")
      .session(session);
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll not found",
      });
    }

    const oldNetSalary = payroll.netSalary;
    const oldSource = payroll.source;

    // Update fields
    if (basicSalary !== undefined)
      payroll.basicSalary = parseFloat(basicSalary);
    if (deductions !== undefined) payroll.deductions = parseFloat(deductions);
    if (status) payroll.status = status;
    if (paymentMethod) payroll.paymentMethod = paymentMethod;
    if (bankAccount !== undefined) payroll.bankAccount = bankAccount;
    if (paymentDate !== undefined) payroll.paymentDate = paymentDate;
    if (remarks !== undefined) payroll.remarks = remarks;
    if (enabled !== undefined) payroll.enabled = enabled;
    if (source !== undefined) payroll.source = source;

    // Update allowances if provided and recalculate total allowance
    if (allowances && Array.isArray(allowances)) {
      payroll.allowances = allowances.map((allowance) => ({
        type: allowance.type.trim(),
        amount: parseFloat(allowance.amount),
      }));

      // Recalculate total allowance
      payroll.totalAllowance = payroll.allowances.reduce(
        (total, allowance) => total + allowance.amount,
        0
      );
    }

    // Recalculate net salary
    payroll.netSalary =
      payroll.basicSalary + payroll.totalAllowance - payroll.deductions;

    // Handle account balance updates
    const newNetSalary = payroll.netSalary;
    const newSource = payroll.source;

    if (oldSource && oldSource._id.toString() === newSource.toString()) {
      // Same source account, adjust balance by difference
      const amountDifference = newNetSalary - oldNetSalary;
      if (amountDifference !== 0) {
        await updateAccountBalance(
          oldSource._id,
          Math.abs(amountDifference),
          amountDifference > 0 ? "subtract" : "add",
          session
        );
      }
    } else {
      // Different source account
      // Add back to old source
      if (oldSource) {
        await updateAccountBalance(oldSource._id, oldNetSalary, "add", session);
      }
      // Subtract from new source
      await updateAccountBalance(newSource, newNetSalary, "subtract", session);
    }

    await payroll.save({ session });
    await payroll.populate(
      "employeeId",
      "medicalRepName teamName contactNo email"
    );
    await payroll.populate("source", "name code totalAmount");

    // Commit transaction
    await session.commitTransaction();

    // Transform the response
    const responseData = payroll.toObject();
    if (responseData.employeeId) {
      responseData.employeeName = responseData.employeeId.medicalRepName;
      responseData.teamName = responseData.employeeId.teamName;
    }

    res.status(200).json({
      success: true,
      message: "Payroll updated successfully",
      data: responseData,
    });
  } catch (error) {
    // Only abort transaction if it was started
    if (session.transaction?.isActive) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error("❌ Error aborting transaction:", abortError);
      }
    }
    console.error("❌ Error updating payroll:", error);

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: messages,
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid payroll ID",
      });
    }

    if (error.message.includes("Insufficient balance")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update payroll",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
});

// ==================== DELETE PAYROLL ====================
router.delete("/payrolls/:id", async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    const { id } = req.params;

    const payroll = await Payroll.findById(id)
      .populate("source")
      .session(session);

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll not found",
      });
    }

    // Add the net salary back to the source account
    if (payroll.source) {
      await updateAccountBalance(
        payroll.source._id,
        payroll.netSalary,
        "add",
        session
      );
    }

    await Payroll.findByIdAndDelete(id).session(session);

    // Commit transaction
    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Payroll deleted successfully",
      data: { id },
    });
  } catch (error) {
    // Only abort transaction if it was started
    if (session.transaction?.isActive) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error("❌ Error aborting transaction:", abortError);
      }
    }
    console.error("❌ Error deleting payroll:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid payroll ID",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to delete payroll",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
});

// ==================== BULK DELETE PAYROLLS ====================
router.delete("/payrolls", async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Array of payroll IDs is required",
      });
    }

    // Validate IDs
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== ids.length) {
      return res.status(400).json({
        success: false,
        message: "Some payroll IDs are invalid",
      });
    }

    // Find all payrolls to be deleted with their source accounts
    const payrollsToDelete = await Payroll.find({ _id: { $in: validIds } })
      .populate("source")
      .session(session);

    if (payrollsToDelete.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No payrolls found to delete",
      });
    }

    // Add back net salaries to respective source accounts
    for (const payroll of payrollsToDelete) {
      if (payroll.source) {
        await updateAccountBalance(
          payroll.source._id,
          payroll.netSalary,
          "add",
          session
        );
      }
    }

    const result = await Payroll.deleteMany({ _id: { $in: validIds } }).session(
      session
    );

    // Commit transaction
    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} payroll(s) deleted successfully`,
      data: { deletedCount: result.deletedCount },
    });
  } catch (error) {
    // Only abort transaction if it was started
    if (session.transaction?.isActive) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error("❌ Error aborting transaction:", abortError);
      }
    }
    console.error("❌ Error deleting multiple payrolls:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete payrolls",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
});

export default router;
