import express from "express";
import mongoose from "mongoose";
import CategoryType from "../../models/accounts/CategoryType.js";
import Destination from "../../models/accounts/Destination.js";
import Sale from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";

const router = express.Router();

// ========== SPECIFIC ROUTES FIRST ==========

// Category Types
router.get("/category-type", async (req, res) => {
  try {
    const categories = await CategoryType.find({ isActive: true })
      .sort({ name: 1 })
      .lean();

    res.status(200).json({
      success: true,
      data: categories,
      count: categories.length,
    });
  } catch (err) {
    console.error("Failed to fetch category types:", err);
    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

router.post("/category-type", async (req, res) => {
  try {
    const { name, description, code } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    const existingCategory = await CategoryType.findOne({
      name: name.trim(),
      isActive: true,
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category type with this name already exists",
      });
    }

    const categoryType = new CategoryType({
      name: name.trim(),
      description: description?.trim() || "",
      code: code?.trim() || "",
      isActive: true,
    });

    await categoryType.save();

    res.status(201).json({
      success: true,
      message: "Category type created successfully",
      data: categoryType,
    });
  } catch (err) {
    console.error("Failed to create category type:", err);

    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Duplicate category type",
      });
    }

    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

router.put("/category-type/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, code, isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category type ID format",
      });
    }

    const categoryType = await CategoryType.findById(id);

    if (!categoryType) {
      return res.status(404).json({
        success: false,
        message: "Category type not found",
      });
    }

    if (name !== undefined) categoryType.name = name.trim();
    if (description !== undefined)
      categoryType.description = description.trim();
    if (code !== undefined) categoryType.code = code.trim();
    if (isActive !== undefined) categoryType.isActive = isActive;

    await categoryType.save();

    res.status(200).json({
      success: true,
      message: "Category type updated successfully",
      data: categoryType,
    });
  } catch (err) {
    console.error("Failed to update category type:", err);
    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

router.delete("/category-type/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category type ID format",
      });
    }

    const categoryType = await CategoryType.findById(id);

    if (!categoryType) {
      return res.status(404).json({
        success: false,
        message: "Category type not found",
      });
    }

    categoryType.isActive = false;
    await categoryType.save();

    res.status(200).json({
      success: true,
      message: "Category type deleted successfully",
    });
  } catch (err) {
    console.error("Failed to delete category type:", err);
    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

// Destinations
router.get("/destinations", async (req, res) => {
  try {
    const destinations = await Destination.find({ isActive: true })
      .sort({ name: 1 })
      .lean();

    res.status(200).json({
      success: true,
      data: destinations,
      count: destinations.length,
    });
  } catch (err) {
    console.error("Failed to fetch destinations:", err);
    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

router.post("/destinations", async (req, res) => {
  try {
    const { name, description, code, address, city, state, pincode } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Destination name is required",
      });
    }

    const existingDestination = await Destination.findOne({
      name: name.trim(),
      isActive: true,
    });

    if (existingDestination) {
      return res.status(400).json({
        success: false,
        message: "Destination with this name already exists",
      });
    }

    const destination = new Destination({
      name: name.trim(),
      description: description?.trim() || "",
      code: code?.trim() || "",
      address: address?.trim() || "",
      city: city?.trim() || "",
      state: state?.trim() || "",
      pincode: pincode?.trim() || "",
      isActive: true,
    });

    await destination.save();

    res.status(201).json({
      success: true,
      message: "Destination created successfully",
      data: destination,
    });
  } catch (err) {
    console.error("Failed to create destination:", err);

    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Duplicate destination",
      });
    }

    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

router.put("/destinations/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      code,
      address,
      city,
      state,
      pincode,
      isActive,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid destination ID format",
      });
    }

    const destination = await Destination.findById(id);

    if (!destination) {
      return res.status(404).json({
        success: false,
        message: "Destination not found",
      });
    }

    if (name !== undefined) destination.name = name.trim();
    if (description !== undefined)
      destination.description = description.trim();
    if (code !== undefined) destination.code = code.trim();
    if (address !== undefined) destination.address = address.trim();
    if (city !== undefined) destination.city = city.trim();
    if (state !== undefined) destination.state = state.trim();
    if (pincode !== undefined) destination.pincode = pincode.trim();
    if (isActive !== undefined) destination.isActive = isActive;

    await destination.save();

    res.status(200).json({
      success: true,
      message: "Destination updated successfully",
      data: destination,
    });
  } catch (err) {
    console.error("Failed to update destination:", err);
    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

router.delete("/destinations/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid destination ID format",
      });
    }

    const destination = await Destination.findById(id);

    if (!destination) {
      return res.status(404).json({
        success: false,
        message: "Destination not found",
      });
    }

    destination.isActive = false;
    await destination.save();

    res.status(200).json({
      success: true,
      message: "Destination deleted successfully",
    });
  } catch (err) {
    console.error("Failed to delete destination:", err);
    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

// ========== GENERAL ROUTES (including /:id) ==========

router.get("/", async (req, res) => {
  try {
    const {
      invoiceNumber,
      customerCode,
      startDate,
      endDate,
      page = 1,
      limit = 10,
      sortBy = "invoiceDate",
      sortOrder = "desc",
    } = req.query;

    const query = { isActive: true };

    if (invoiceNumber) {
      query.invoiceNumber = { $regex: invoiceNumber, $options: "i" };
    }

    if (customerCode) {
      query.customerCode = customerCode;
    }

    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) query.invoiceDate.$gte = new Date(startDate);
      if (endDate) query.invoiceDate.$lte = new Date(endDate);
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sales = await Sale.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const accounts = await Promise.all(
      sales.map(async (sale) => {
        let customerInfo = null;

        if (sale.customerCode) {
          customerInfo = await Customer.findOne({
            customerCode: sale.customerCode,
          }).lean();
        }

        return {
          _id: sale._id,
          invoiceNumber: sale.invoiceNumber,
          invoiceDate: sale.invoiceDate,
          customerCode: sale.customerCode,
          customerName: customerInfo?.name || sale.customerName || "N/A",
          customerAddress: customerInfo?.address || "N/A",
          customerPhone: customerInfo?.phone || "",
          totalAmount: sale.totalAmount || 0,
          dueAmount: sale.dueAmount || 0,
          paidAmount: sale.paidAmount || 0,
          paymentStatus: sale.paymentStatus || "Pending",
          remarks: sale.remarks || "",
        };
      })
    );

    const total = await Sale.countDocuments(query);

    res.status(200).json({
      success: true,
      data: accounts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Failed to fetch accounts:", err);
    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

router.get("/alternative", async (req, res) => {
  try {
    const {
      invoiceNumber,
      customerCode,
      startDate,
      endDate,
      page = 1,
      limit = 10,
    } = req.query;

    const matchStage = { isActive: true };

    if (invoiceNumber) {
      matchStage.invoiceNumber = { $regex: invoiceNumber, $options: "i" };
    }

    if (customerCode) {
      matchStage.customerCode = customerCode;
    }

    if (startDate || endDate) {
      matchStage.invoiceDate = {};
      if (startDate) matchStage.invoiceDate.$gte = new Date(startDate);
      if (endDate) matchStage.invoiceDate.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sales = await Sale.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerInfo",
        },
      },
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          invoiceNumber: 1,
          invoiceDate: 1,
          customerCode: 1,
          customerName: {
            $ifNull: ["$customerInfo.name", "$customerName", "N/A"],
          },
          customerAddress: {
            $ifNull: ["$customerInfo.address", "N/A"],
          },
          customerPhone: {
            $ifNull: ["$customerInfo.phone", ""],
          },
          totalAmount: 1,
          dueAmount: 1,
          paidAmount: 1,
          paymentStatus: 1,
          remarks: 1,
        },
      },
      { $sort: { invoiceDate: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
    ]);

    const totalCount = await Sale.countDocuments(matchStage);

    const transformedSales = sales.map((sale) => ({
      _id: sale._id,
      invoiceNumber: sale.invoiceNumber,
      invoiceDate: sale.invoiceDate,
      customerCode: sale.customerCode,
      customerName: sale.customerName,
      customerAddress: sale.customerAddress,
      customerPhone: sale.customerPhone,
      amount: sale.totalAmount || 0,
      dueAmount: sale.dueAmount || 0,
      paidAmount: sale.paidAmount || 0,
      paymentStatus: sale.paymentStatus || "Pending",
      remarks: sale.remarks || "",
    }));

    res.status(200).json({
      success: true,
      data: transformedSales,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Failed to fetch accounts:", err);
    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

router.get("/statistics", async (req, res) => {
  try {
    const { startDate, endDate, customerCode } = req.query;

    const matchStage = { isActive: true };

    if (startDate || endDate) {
      matchStage.invoiceDate = {};
      if (startDate) matchStage.invoiceDate.$gte = new Date(startDate);
      if (endDate) matchStage.invoiceDate.$lte = new Date(endDate);
    }

    if (customerCode) {
      matchStage.customerCode = customerCode;
    }

    const stats = await Sale.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalSales: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
          totalDue: { $sum: "$dueAmount" },
          totalPaid: { $sum: "$paidAmount" },
          pendingSales: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "Pending"] }, 1, 0] },
          },
          completedSales: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "Completed"] }, 1, 0] },
          },
          partialSales: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "Partial"] }, 1, 0] },
          },
        },
      },
    ]);

    const topCustomers = await Sale.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$customerCode",
          customerName: { $first: "$customerName" },
          totalSales: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: 5 },
    ]);

    res.status(200).json({
      success: true,
      data: {
        summary: stats[0] || {
          totalSales: 0,
          totalAmount: 0,
          totalDue: 0,
          totalPaid: 0,
          pendingSales: 0,
          completedSales: 0,
          partialSales: 0,
        },
        topCustomers,
      },
    });
  } catch (err) {
    console.error("Failed to fetch statistics:", err);
    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

// Parameterized route must come last
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid account ID format",
      });
    }

    const sale = await Sale.findOne({ _id: id, isActive: true }).lean();

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: "Account not found",
      });
    }

    let customerInfo = null;
    if (sale.customerCode) {
      customerInfo = await Customer.findOne({
        customerCode: sale.customerCode,
      }).lean();
    }

    const account = {
      _id: sale._id,
      invoiceNumber: sale.invoiceNumber,
      invoiceDate: sale.invoiceDate,
      customerCode: sale.customerCode,
      customerName: customerInfo?.name || sale.customerName || "N/A",
      customerAddress: customerInfo?.address || "N/A",
      customerPhone: customerInfo?.phone || "",
      totalAmount: sale.totalAmount || 0,
      dueAmount: sale.dueAmount || 0,
      paidAmount: sale.paidAmount || 0,
      paymentStatus: sale.paymentStatus || "Pending",
      remarks: sale.remarks || "",
      items: sale.items || [],
    };

    res.status(200).json({
      success: true,
      data: account,
    });
  } catch (err) {
    console.error("Failed to fetch account:", err);
    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
    });
  }
});

export default router;