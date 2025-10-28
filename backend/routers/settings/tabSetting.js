import HTab from "../../models/settings/tabSetting.js";
import mongoose from "mongoose";
import express from "express";

const router = express.Router();

export const getHTabs = async (req, res) => {
  try {
    const {
      search = "",
      reportType = "",
      category = "",
      level = "",
      parentTabId = "",
      sortBy = "sequence",
      sortOrder = "asc",
    } = req.query;

    // Build filter object
    const filter = { isActive: true };

    // Search functionality
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      filter.$or = [
        { name: searchRegex },
        { description: searchRegex },
        { tabId: searchRegex },
        { path: searchRegex },
      ];
    }

    // Report type filter
    if (reportType && reportType.trim() !== "" && reportType !== "All") {
      filter.reportType = { $in: [reportType, "All"] };
    }

    // Category filter
    if (category && category.trim() !== "") {
      filter.category = category;
    }

    // Level filter
    if (level !== "" && !isNaN(level)) {
      filter.level = parseInt(level);
    }

    // Parent tab filter
    if (parentTabId && parentTabId.trim() !== "") {
      filter.parentTabId = parentTabId;
    }

    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Get ALL data without pagination
    const tabs = await HTab.find(filter).sort(sortConfig).select("-__v").lean();

    // Get total count
    const totalRecords = tabs.length;

    // Format response
    const formattedTabs = tabs.map((tab) => ({
      id: tab._id,
      tabId: tab.tabId,
      name: tab.name,

      path: tab.path,
      icon: tab.icon,
      parentTabId: tab.parentTabId,
      level: tab.level,
      sequence: tab.sequence,
      isVisible: tab.isVisible,
      category: tab.category,
      reportType: tab.reportType,
      isActive: tab.isActive,
    }));

    res.status(200).json({
      success: true,
      data: {
        tabs: formattedTabs,
        totalRecords,
      },
    });
  } catch (error) {
    console.error("Error fetching HTabs:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get visible tabs for sidebar
export const getVisibleTabs = async (req, res) => {
  try {
    const tabs = await HTab.find({
      isActive: true,
      isVisible: true,
    })
      .sort({ level: 1, sequence: 1 })
      .select("-__v")
      .lean();

    // Convert to object format for frontend
    const visibleTabs = {};
    tabs.forEach((tab) => {
      visibleTabs[tab.tabId] = {
        visible: tab.isVisible,
        sequence: tab.sequence,
      };
    });

    res.status(200).json({
      success: true,
      data: visibleTabs,
    });
  } catch (error) {
    console.error("Error fetching visible tabs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch visible tabs",
      error: error.message,
    });
  }
};

// Update tab visibility
export const updateTabVisibility = async (req, res) => {
  try {
    const { updates } = req.body;

    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({
        success: false,
        message: "Updates array is required",
      });
    }

    const bulkOperations = updates.map((update) => ({
      updateOne: {
        filter: { tabId: update.tabId },
        update: {
          $set: {
            isVisible: update.isVisible,
            updatedAt: new Date(),
          },
        },
      },
    }));

    const result = await HTab.bulkWrite(bulkOperations);

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} tab(s) visibility updated successfully`,
      data: {
        modifiedCount: result.modifiedCount,
      },
    });
  } catch (error) {
    console.error("Error updating tab visibility:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update tab visibility",
      error: error.message,
    });
  }
};

// Update tab sequence
export const updateTabSequence = async (req, res) => {
  try {
    const { updates } = req.body;

    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({
        success: false,
        message: "Updates array is required",
      });
    }

    const bulkOperations = updates.map((update) => ({
      updateOne: {
        filter: { tabId: update.tabId },
        update: {
          $set: {
            sequence: update.sequence,
            updatedAt: new Date(),
          },
        },
      },
    }));

    const result = await HTab.bulkWrite(bulkOperations);

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} tab(s) sequence updated successfully`,
      data: {
        modifiedCount: result.modifiedCount,
      },
    });
  } catch (error) {
    console.error("Error updating tab sequence:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update tab sequence",
      error: error.message,
    });
  }
};

// Create new tab
export const createTab = async (req, res) => {
  try {
    const {
      tabId,
      name,
      description,
      path,
      icon,
      parentTabId,
      level,
      sequence,
      category,
      reportType,
      permissions,
    } = req.body;

    // Check if tab already exists
    const existingTab = await HTab.findOne({ tabId });
    if (existingTab) {
      return res.status(400).json({
        success: false,
        message: "Tab with this ID already exists",
      });
    }

    const newTab = new HTab({
      tabId,
      name,
      description,
      path,
      icon,
      parentTabId: parentTabId || null,
      level: level || 0,
      sequence: sequence || 0,
      category: category || "main",
      reportType: reportType || "All",
      permissions: permissions || ["read"],
      isVisible: true,
      isActive: true,
      createdBy: req.user?._id,
    });

    await newTab.save();

    res.status(201).json({
      success: true,
      message: "Tab created successfully",
      data: {
        tab: newTab,
      },
    });
  } catch (error) {
    console.error("Error creating tab:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create tab",
      error: error.message,
    });
  }
};

// Get tab by ID - FIXED: Better ObjectId validation
export const getTabById = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if the ID is a valid MongoDB ObjectId
    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);

    let tab;
    if (isValidObjectId) {
      // If it's a valid ObjectId, search by _id
      tab = await HTab.findById(id);
    } else {
      // If it's not a valid ObjectId, search by tabId
      tab = await HTab.findOne({ tabId: id });
    }

    if (!tab) {
      return res.status(404).json({
        success: false,
        message: "Tab not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        tab,
      },
    });
  } catch (error) {
    console.error("Error fetching tab:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tab",
      error: error.message,
    });
  }
};

// Update tab - FIXED: Better ObjectId validation
export const updateTab = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if the ID is a valid MongoDB ObjectId
    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);

    let tab;
    if (isValidObjectId) {
      // If it's a valid ObjectId, update by _id
      tab = await HTab.findByIdAndUpdate(
        id,
        {
          ...updateData,
          updatedAt: new Date(),
          updatedBy: req.user?._id,
        },
        { new: true, runValidators: true }
      );
    } else {
      // If it's not a valid ObjectId, update by tabId
      tab = await HTab.findOneAndUpdate(
        { tabId: id },
        {
          ...updateData,
          updatedAt: new Date(),
          updatedBy: req.user?._id,
        },
        { new: true, runValidators: true }
      );
    }

    if (!tab) {
      return res.status(404).json({
        success: false,
        message: "Tab not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Tab updated successfully",
      data: {
        tab,
      },
    });
  } catch (error) {
    console.error("Error updating tab:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update tab",
      error: error.message,
    });
  }
};

// Delete tab (soft delete) - FIXED: Better ObjectId validation
export const deleteTab = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if the ID is a valid MongoDB ObjectId
    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);

    let tab;
    if (isValidObjectId) {
      // If it's a valid ObjectId, delete by _id
      tab = await HTab.findByIdAndUpdate(
        id,
        {
          isActive: false,
          updatedAt: new Date(),
          updatedBy: req.user?._id,
        },
        { new: true }
      );
    } else {
      // If it's not a valid ObjectId, delete by tabId
      tab = await HTab.findOneAndUpdate(
        { tabId: id },
        {
          isActive: false,
          updatedAt: new Date(),
          updatedBy: req.user?._id,
        },
        { new: true }
      );
    }

    if (!tab) {
      return res.status(404).json({
        success: false,
        message: "Tab not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Tab deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting tab:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete tab",
      error: error.message,
    });
  }
};

// Get tab hierarchy
export const getTabHierarchy = async (req, res) => {
  try {
    console.log("Fetching active tabs from DB...");

    const tabs = await HTab.find({ isActive: true })
      .sort({ level: 1, sequence: 1 })
      .select("tabId name parentTabId sequence level isActive") // Select only needed fields
      .lean();

    console.log(`Found ${tabs.length} active tabs:`);
    console.log(tabs); // raw docs

    // ---------- Build hierarchy ----------
    const buildHierarchy = (parentId = null) => {
      const children = tabs
        .filter((tab) => tab.parentTabId === parentId)
        .map((tab) => ({
          tabId: tab.tabId,
          name: tab.name,
          sequence: tab.sequence,
          level: tab.level,
          isActive: tab.isActive,
          children: buildHierarchy(tab.tabId), // Use tabId as parent reference
        }))
        .sort((a, b) => a.sequence - b.sequence);

      console.log(`Parent ${parentId ?? "ROOT"} → ${children.length} children`);
      return children;
    };

    const hierarchy = buildHierarchy();

    console.log("Final hierarchy built:");
    console.log(JSON.stringify(hierarchy, null, 2)); // pretty-print

    // ---------- Response ----------
    res.status(200).json({
      success: true,
      data: {
        hierarchy,
        totalTabs: tabs.length,
      },
    });
  } catch (error) {
    console.error("Error fetching tab hierarchy:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tab hierarchy",
      error: error.message,
    });
  }
};

// ✅ CORRECTED ROUTE ORDER - Specific routes first, generic routes last
router.get("/visible", getVisibleTabs);
router.get("/hierarchy", getTabHierarchy);
router.put("/visibility", updateTabVisibility);
router.put("/sequence", updateTabSequence);
router.post("/", createTab);
router.get("/:id", getTabById); // This should be AFTER specific routes
router.put("/:id", updateTab); // This should be AFTER specific routes
router.delete("/:id", deleteTab); // This should be AFTER specific routes
router.get("/", getHTabs); // This should be LAST

export default router;
