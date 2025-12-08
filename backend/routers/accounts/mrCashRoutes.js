import express from "express";
import MRCash from "../../models/accounts/MRCash.js";
import Staff from "../../models/Staff.js";
import { protect } from "../../middleware/authMiddleware.js";

const router = express.Router();

// @route   GET /api/accounts/mrcash
// @desc    Get all MR Cash records
// @access  Private
router.get("/", protect, async (req, res) => {
  try {
    const {
      search = "",
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const query = { isActive: true };
    
    // Search functionality
    if (search) {
      query.$or = [
        { mrName: { $regex: search, $options: "i" } },
        { notes: { $regex: search, $options: "i" } }
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get total count
    const total = await MRCash.countDocuments(query);

    // Get paginated data
    const mrCashes = await MRCash.find(query)
      .populate("mrId", "medicalRepName employeeName phone email")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Format the response
    const formattedData = mrCashes.map(mr => ({
      _id: mr._id,
      mrId: mr.mrId?._id || mr.mrId,
      mrName: mr.mrName,
      mrDetails: mr.mrId ? {
        name: mr.mrId.medicalRepName || mr.mrId.employeeName,
        phone: mr.mrId.phone,
        email: mr.mrId.email
      } : null,
      currentCash: mr.currentCash,
      cashTransferredToAdmin: mr.cashTransferredToAdmin,
      totalCash: mr.currentCash + mr.cashTransferredToAdmin,
      lastTransferDate: mr.lastTransferDate,
      notes: mr.notes,
      isActive: mr.isActive,
      createdAt: mr.createdAt,
      updatedAt: mr.updatedAt
    }));

    res.status(200).json({
      success: true,
      data: formattedData,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error("Error fetching MR Cash:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});

// @route   POST /api/accounts/mrcash
// @desc    Create new MR Cash record
// @access  Private
router.post("/", protect, async (req, res) => {
  try {
    const {
      mrId,
      currentCash = 0,
      cashTransferredToAdmin = 0,
      notes = ""
    } = req.body;

    // Validate MR exists
    const staff = await Staff.findById(mrId);
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "MR not found"
      });
    }

    // Check if MR already has a cash record
    const existingMRCash = await MRCash.findOne({ mrId, isActive: true });
    if (existingMRCash) {
      return res.status(400).json({
        success: false,
        message: "Cash record already exists for this MR"
      });
    }

    const mrCash = new MRCash({
      mrId,
      mrName: staff.medicalRepName || staff.employeeName,
      currentCash,
      cashTransferredToAdmin,
      notes,
      createdBy: req.user.id,
      updatedBy: req.user.id
    });

    await mrCash.save();

    res.status(201).json({
      success: true,
      message: "MR Cash record created successfully",
      data: mrCash
    });
  } catch (error) {
    console.error("Error creating MR Cash:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});

// @route   PUT /api/accounts/mrcash/:id
// @desc    Update MR Cash record
// @access  Private
router.put("/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const mrCash = await MRCash.findById(id);
    if (!mrCash) {
      return res.status(404).json({
        success: false,
        message: "MR Cash record not found"
      });
    }

    // If updating MR ID, validate new MR exists
    if (updateData.mrId && updateData.mrId !== mrCash.mrId.toString()) {
      const staff = await Staff.findById(updateData.mrId);
      if (!staff) {
        return res.status(404).json({
          success: false,
          message: "New MR not found"
        });
      }
      updateData.mrName = staff.medicalRepName || staff.employeeName;
    }

    // Update record
    Object.assign(mrCash, updateData);
    mrCash.updatedBy = req.user.id;
    mrCash.updatedAt = new Date();

    await mrCash.save();

    res.status(200).json({
      success: true,
      message: "MR Cash record updated successfully",
      data: mrCash
    });
  } catch (error) {
    console.error("Error updating MR Cash:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});

// @route   POST /api/accounts/mrcash/:id/transfer
// @desc    Transfer cash to admin
// @access  Private
router.post("/:id/transfer", protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid transfer amount is required"
      });
    }

    const mrCash = await MRCash.findById(id);
    if (!mrCash) {
      return res.status(404).json({
        success: false,
        message: "MR Cash record not found"
      });
    }

    if (amount > mrCash.currentCash) {
      return res.status(400).json({
        success: false,
        message: "Insufficient cash available for transfer"
      });
    }

    // Perform transfer using schema method
    await mrCash.transferToAdmin(amount);

    // Optional: Create a transaction log here

    res.status(200).json({
      success: true,
      message: "Cash transferred to admin successfully",
      data: mrCash
    });
  } catch (error) {
    console.error("Error transferring cash:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});

// @route   DELETE /api/accounts/mrcash/:id
// @desc    Soft delete MR Cash record
// @access  Private
router.delete("/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;

    const mrCash = await MRCash.findById(id);
    if (!mrCash) {
      return res.status(404).json({
        success: false,
        message: "MR Cash record not found"
      });
    }

    mrCash.isActive = false;
    mrCash.updatedBy = req.user.id;
    await mrCash.save();

    res.status(200).json({
      success: true,
      message: "MR Cash record deactivated successfully"
    });
  } catch (error) {
    console.error("Error deleting MR Cash:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});

// @route   GET /api/accounts/mrcash/mr-list
// @desc    Get list of MRs without cash records (for dropdown)
// @access  Private
router.get("/mr-list", protect, async (req, res) => {
  try {
    const mrs = await Staff.find({
      role: "mr",
      isActive: true
    }).select("medicalRepName employeeName phone email");

    // Filter out MRs that already have cash records
    const mrIdsWithCash = await MRCash.distinct("mrId", { isActive: true });
    const availableMRs = mrs.filter(mr => !mrIdsWithCash.includes(mr._id));

    const formattedMRs = availableMRs.map(mr => ({
      value: mr._id,
      label: mr.medicalRepName || mr.employeeName || `MR ${mr._id}`,
      phone: mr.phone,
      email: mr.email
    }));

    res.status(200).json({
      success: true,
      data: formattedMRs
    });
  } catch (error) {
    console.error("Error fetching MR list:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});

export default router;