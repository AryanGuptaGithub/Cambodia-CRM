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

    const filter = { isActive: true };

    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      filter.$or = [
        { name: searchRegex },
        { description: searchRegex },
        { tabId: searchRegex },
        { path: searchRegex },
      ];
    }

    if (reportType && reportType.trim() !== "" && reportType !== "All") {
      filter.reportType = { $in: [reportType, "All"] };
    }

    if (category && category.trim() !== "") {
      filter.category = category;
    }

    if (level !== "" && !isNaN(level)) {
      filter.level = parseInt(level);
    }

    if (parentTabId && parentTabId.trim() !== "") {
      filter.parentTabId = parentTabId;
    }

    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

    const tabs = await HTab.find(filter).sort(sortConfig).select("-__v").lean();
    const totalRecords = tabs.length;

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

export const getVisibleTabs = async (req, res) => {
  try {
    const tabs = await HTab.find({
      isActive: true,
      isVisible: true,
    })
      .sort({ level: 1, sequence: 1 })
      .select("-__v")
      .lean();

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

// -------------------- UPDATE TAB VISIBILITY --------------------
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

    const updateParentVisibility = async (tabId, visited = new Set()) => {
      if (visited.has(tabId)) return;
      visited.add(tabId);

      const tab = await HTab.findOne({ tabId });
      if (!tab || !tab.parentTabId) return;

      const parentTabId = tab.parentTabId;
      const siblings = await HTab.find({ parentTabId: parentTabId });

      const allHidden =
        siblings.length > 0 && siblings.every((t) => t.isVisible === false);

      if (allHidden) {
        await HTab.updateOne(
          { tabId: parentTabId },
          { $set: { isVisible: false, updatedAt: new Date() } }
        );
      }

      await updateParentVisibility(parentTabId, visited);
    };

    for (const update of updates) {
      await updateParentVisibility(update.tabId);
    }

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} tab(s) visibility updated successfully (with cascading checks)`,
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

// -------------------- CREATE TAB --------------------
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
      data: { tab: newTab },
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

// -------------------- GET TAB BY ID --------------------
export const getTabById = async (req, res) => {
  try {
    const { id } = req.params;
    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);

    const tab = isValidObjectId
      ? await HTab.findById(id)
      : await HTab.findOne({ tabId: id });

    if (!tab) {
      return res.status(404).json({
        success: false,
        message: "Tab not found",
      });
    }

    res.status(200).json({
      success: true,
      data: { tab },
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

// -------------------- UPDATE TAB --------------------
export const updateTab = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);

    const tab = isValidObjectId
      ? await HTab.findByIdAndUpdate(
          id,
          { ...updateData, updatedAt: new Date(), updatedBy: req.user?._id },
          { new: true, runValidators: true }
        )
      : await HTab.findOneAndUpdate(
          { tabId: id },
          { ...updateData, updatedAt: new Date(), updatedBy: req.user?._id },
          { new: true, runValidators: true }
        );

    if (!tab) {
      return res.status(404).json({
        success: false,
        message: "Tab not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Tab updated successfully",
      data: { tab },
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

// -------------------- DELETE TAB --------------------
export const deleteTab = async (req, res) => {
  try {
    const { id } = req.params;
    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);

    const tab = isValidObjectId
      ? await HTab.findByIdAndUpdate(
          id,
          { isActive: false, updatedAt: new Date(), updatedBy: req.user?._id },
          { new: true }
        )
      : await HTab.findOneAndUpdate(
          { tabId: id },
          { isActive: false, updatedAt: new Date(), updatedBy: req.user?._id },
          { new: true }
        );

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

// -------------------- GET TAB HIERARCHY --------------------
export const getTabHierarchy = async (req, res) => {
  try {
    const tabs = await HTab.find({ isActive: true })
      .sort({ level: 1, sequence: 1 })
      .select("tabId name parentTabId sequence level isActive isVisible")
      .lean();

    const buildHierarchy = (parentId = null) => {
      const children = tabs
        .filter((tab) => tab.parentTabId === parentId)
        .map((tab) => ({
          tabId: tab.tabId,
          name: tab.name,
          sequence: tab.sequence,
          level: tab.level,
          isActive: tab.isActive,
          isVisible: tab.isVisible,
          children: buildHierarchy(tab.tabId),
        }))
        .sort((a, b) => a.sequence - b.sequence);
      return children;
    };

    const hierarchy = buildHierarchy();

    res.status(200).json({
      success: true,
      data: { hierarchy, totalTabs: tabs.length },
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

// -------------------- UPDATE TAB SEQUENCE --------------------
export const updateSequence = async (req, res) => {
  try {
    const { sequences } = req.body;

    if (!sequences || !Array.isArray(sequences)) {
      return res.status(400).json({
        success: false,
        message: "Sequences array is required",
      });
    }

    const bulkOperations = sequences.map((item) => ({
      updateOne: {
        filter: { tabId: item.tabId },
        update: {
          $set: { sequence: item.sequence, updatedAt: new Date() },
        },
      },
    }));

    const result = await HTab.bulkWrite(bulkOperations);

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} tab(s) sequence updated successfully`,
      data: { modifiedCount: result.modifiedCount },
    });
  } catch (error) {
    console.error("Error updating tab sequences:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update tab sequences",
      error: error.message,
    });
  }
};

// -------------------- GET VIRTUAL SEQUENCES --------------------

export const updateVirtualSequence = async (req, res) => {
  try {
    const { updates } = req.body;

    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({
        success: false,
        message: "Updates array is required",
      });
    }

    // Validate all updates first
    for (const update of updates) {
      if (!update.tabId || !update.virtualSequence) {
        return res.status(400).json({
          success: false,
          message: "Each update must contain tabId and virtualSequence",
        });
      }

      if (update.virtualSequence < 1) {
        return res.status(400).json({
          success: false,
          message: "Virtual sequence must be at least 1",
        });
      }
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Get all tabs that will be affected
      const tabIds = updates.map((update) => update.tabId);
      const allTabs = await HTab.find({ tabId: { $in: tabIds } }).session(
        session
      );

      if (allTabs.length !== updates.length) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: "One or more tabs not found",
        });
      }

      // Group updates by parentTabId to handle sequences within each group
      const updatesByParent = {};
      updates.forEach((update) => {
        const tab = allTabs.find((t) => t.tabId === update.tabId);
        const parentKey = tab.parentTabId || "root";
        if (!updatesByParent[parentKey]) {
          updatesByParent[parentKey] = [];
        }
        updatesByParent[parentKey].push({
          tabId: update.tabId,
          virtualSequence: update.virtualSequence,
          currentSequence: tab.sequence,
        });
      });

      // Process each parent group
      for (const [parentId, parentUpdates] of Object.entries(updatesByParent)) {
        // Get all siblings in this parent group
        const siblingFilter =
          parentId === "root"
            ? { parentTabId: null, isActive: true }
            : { parentTabId: parentId, isActive: true };

        const siblings = await HTab.find(siblingFilter)
          .session(session)
          .sort({ sequence: 1 });

        // Create a map of current sequences
        const currentSequences = {};
        siblings.forEach((sibling) => {
          currentSequences[sibling.tabId] = sibling.sequence;
        });

        // Check for sequence conflicts
        const usedSequences = new Set();
        const sequenceConflicts = [];

        parentUpdates.forEach((update) => {
          if (usedSequences.has(update.virtualSequence)) {
            sequenceConflicts.push(update.virtualSequence);
          }
          usedSequences.add(update.virtualSequence);
        });

        if (sequenceConflicts.length > 0) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `Duplicate virtual sequences found: ${sequenceConflicts.join(
              ", "
            )}`,
          });
        }

        // Update sequences
        const bulkOperations = parentUpdates.map((update) => ({
          updateOne: {
            filter: { tabId: update.tabId },
            update: {
              $set: {
                sequence: update.virtualSequence,
                updatedAt: new Date(),
              },
            },
          },
        }));

        if (bulkOperations.length > 0) {
          await HTab.bulkWrite(bulkOperations, { session });
        }
      }

      await session.commitTransaction();
      session.endSession();

      res.status(200).json({
        success: true,
        message: `${updates.length} tab sequence(s) updated successfully`,
        data: {
          modifiedCount: updates.length,
        },
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    console.error("Error updating virtual sequences:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update tab sequences",
      error: error.message,
    });
  }
};

export const swapVirtualSequences = async (req, res) => {
  try {
    const { tabId1, tabId2 } = req.body;

    if (!tabId1 || !tabId2) {
      return res.status(400).json({
        success: false,
        message: "Both tabId1 and tabId2 are required",
      });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Get both tabs
      const [tab1, tab2] = await HTab.find({
        tabId: { $in: [tabId1, tabId2] },
      }).session(session);

      if (!tab1 || !tab2) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: "One or both tabs not found",
        });
      }

      // Check if they have the same parent (should be in the same group)
      if (tab1.parentTabId !== tab2.parentTabId) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "Cannot swap sequences of tabs from different parent groups",
        });
      }

      // Swap sequences
      const tempSequence = tab1.sequence;
      tab1.sequence = tab2.sequence;
      tab2.sequence = tempSequence;

      await tab1.save({ session });
      await tab2.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.status(200).json({
        success: true,
        message: `Sequences swapped successfully between ${tab1.name} and ${tab2.name}`,
        data: {
          tab1: { tabId: tab1.tabId, name: tab1.name, sequence: tab1.sequence },
          tab2: { tabId: tab2.tabId, name: tab2.name, sequence: tab2.sequence },
        },
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    console.error("Error swapping virtual sequences:", error);
    res.status(500).json({
      success: false,
      message: "Failed to swap sequences",
      error: error.message,
    });
  }
};

export const getTabsGroupedByParentWithSequence = async (req, res) => {
  try {
    const tabs = await HTab.find({ isActive: true })
      .sort({ level: 1, sequence: 1 })
      .select("tabId name parentTabId isVisible level sequence")
      .lean();

    // Build a map of all tabs by tabId for quick lookup
    const tabsMap = new Map();
    tabs.forEach((tab) => {
      tabsMap.set(tab.tabId, {
        ...tab,
        children: [],
      });
    });

    // Build the hierarchy
    const rootTabs = [];
    tabs.forEach((tab) => {
      if (tab.parentTabId && tabsMap.has(tab.parentTabId)) {
        // This tab has a parent, add it to parent's children
        const parent = tabsMap.get(tab.parentTabId);
        parent.children.push(tabsMap.get(tab.tabId));
      } else {
        // This is a root level tab
        rootTabs.push(tabsMap.get(tab.tabId));
      }
    });

    // Sort root tabs by sequence
    rootTabs.sort((a, b) => a.sequence - b.sequence);

    // Function to assign virtual sequences recursively
    const assignVirtualSequences = (tabsArray, parentSequence = null) => {
      return tabsArray.map((tab, index) => {
        const virtualSequence = index + 1;

        const resultTab = {
          name: tab.name,
          virtualSequence: virtualSequence,
          tabId: tab.tabId,
          parentTabId: tab.parentTabId,
          level: tab.level,
          sequence: tab.sequence,
        };

        // If this tab has children, process them recursively
        if (tab.children && tab.children.length > 0) {
          // Sort children by sequence
          tab.children.sort((a, b) => a.sequence - b.sequence);
          resultTab.children = assignVirtualSequences(
            tab.children,
            virtualSequence
          );
        }

        return resultTab;
      });
    };

    // Assign virtual sequences starting from root
    const rootWithVirtualSequences = assignVirtualSequences(rootTabs);

    res.status(200).json({
      success: true,
      data: {
        groups: {
          root: rootWithVirtualSequences,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching grouped tabs with virtual sequence:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch grouped tabs with virtual sequence",
      error: error.message,
    });
  }
};

router.get("/h-tabs/visible", getVisibleTabs);
router.get("/h-tabs/hierarchy", getTabHierarchy);
router.put("/h-tabs/visibility", updateTabVisibility);
router.put("/h-tabs/sequence", updateSequence);
router.post("/h-tabs", createTab);
router.get("/h-tabs:id", getTabById);
router.put("/h-tabs:id", updateTab);
router.delete("/h-tabs:id", deleteTab);
router.get("/h-tabs", getHTabs);
router.get("/h-tabs/virtual-sequences", getTabsGroupedByParentWithSequence);
router.put("/h-tabs/virtual-sequence", updateVirtualSequence);
router.post("/h-tabs/swap-sequences", swapVirtualSequences);

export default router;
