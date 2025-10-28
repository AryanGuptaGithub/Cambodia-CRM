import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Trash2,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";
import { confirmDialog } from "../../utils/confirmationDialog";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const HTabsManipulation = () => {
  const [tabs, setTabs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    hasNext: false,
    hasPrev: false,
  });
  const [reportTypes, setReportTypes] = useState([
    "Hide/Show Tabs",
    "Sequence Number",
  ]);
  const [selectedReportType, setSelectedReportType] =
    useState("Hide/Show Tabs");
  const [isSaving, setIsSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [selected, setSelected] = useState([]);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("add");
  const [selectedItems, setSelectedItems] = useState([]);
  const [allSelected, setAllSelected] = useState(false);
  const [expandedTabs, setExpandedTabs] = useState({});
  const [tabHierarchy, setTabHierarchy] = useState([]);

  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem("hTabsVisibleColumns");
    if (saved) return JSON.parse(saved);
    const defaultVisible = {};
    tabHierarchy.forEach((field) => {
      defaultVisible[field.id] = true;
    });
    return defaultVisible;
  });

  const inputRef = useRef(null);
  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages
  );

  useEffect(() => {
    localStorage.setItem("hTabsVisibleColumns", JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const removeDuplicateTabs = (tabsArray) => {
    const seen = new Set();
    return tabsArray.filter((tab) => {
      if (seen.has(tab.tabId)) return false;
      seen.add(tab.tabId);
      return true;
    });
  };

  const buildHierarchy = (flatTabs) => {
    const tabsMap = new Map();
    const roots = [];
    const uniqueTabs = removeDuplicateTabs(flatTabs);

    uniqueTabs.forEach((tab) => {
      tabsMap.set(tab.tabId, { ...tab, children: [] });
    });

    uniqueTabs.forEach((tab) => {
      const node = tabsMap.get(tab.tabId);
      if (tab.parentTabId && tabsMap.has(tab.parentTabId)) {
        const parent = tabsMap.get(tab.parentTabId);
        parent.children.push(node);
        parent.children.sort((a, b) => a.sequence - b.sequence);
      } else {
        roots.push(node);
      }
    });

    return roots.sort((a, b) => a.sequence - b.sequence);
  };

  const fetchTabsData = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${backendUrl}/api/h-tabs`, {
        params: { reportType: selectedReportType },
      });

      const tabsData =
        response.data?.data?.tabs || response.data?.tabs || response.data || [];
      const uniqueTabs = removeDuplicateTabs(tabsData);
      setTabs(uniqueTabs);
    } catch (error) {
      console.error("Error fetching tabs data:", error);
      showToast("error", "Failed to fetch tabs data");
    } finally {
      setLoading(false);
    }
  };

  const fetchTabHierarchy = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/h-tabs/hierarchy`);
      if (response.data.success) {
        const hierarchyData = response.data.data?.hierarchy || [];
        setTabHierarchy(hierarchyData);
      } else {
        const fallback = await axios.get(`${backendUrl}/api/h-tabs`);
        const tabsData = fallback.data?.data?.tabs || fallback.data?.tabs || [];
        setTabHierarchy(buildHierarchy(tabsData));
      }
    } catch (error) {
      console.error("Error fetching hierarchy:", error);
      const fallback = await axios.get(`${backendUrl}/api/h-tabs`);
      const tabsData = fallback.data?.data?.tabs || fallback.data?.tabs || [];
      setTabHierarchy(buildHierarchy(tabsData));
    }
  };

  useEffect(() => {
    fetchTabsData();
    fetchTabHierarchy();
  }, [selectedReportType]);

  const toggleExpand = (tabId) => {
    setExpandedTabs((prev) => ({
      ...prev,
      [tabId]: !prev[tabId],
    }));
  };

  // ✅ Updated Parent Toggle
  const handleParentTabToggle = async (parentTab, isVisible) => {
    console.log("1. handleParentTabToggle called with:", {
      parentTab,
      isVisible,
    });
    try {
      console.log("2. Updating local UI state for parent tab");
      // Update local UI instantly
      setTabHierarchy((prevTabs) => {
        console.log("3. setTabHierarchy callback started, prevTabs:", prevTabs);
        const updateVisibility = (tabs) => {
          console.log("4. updateVisibility called with tabs:", tabs);
          return tabs.map((tab) => {
            console.log("5. Processing tab:", tab.tabId, tab.name);
            if (tab.tabId === parentTab.tabId) {
              console.log("6. Found matching parent tab, updating visibility");
              return {
                ...tab,
                isVisible,
                children: updateVisibility(tab.children || []),
              };
            }
            if (tab.children && tab.children.length > 0) {
              console.log("7. Tab has children, recursing into children");
              return { ...tab, children: updateVisibility(tab.children) };
            }
            console.log("8. Returning unchanged tab");
            return tab;
          });
        };
        const result = updateVisibility(prevTabs);
        console.log("9. setTabHierarchy result:", result);
        return result;
      });

      console.log("10. Building backend payload");
      // Build backend payload
      const getAllChildTabs = (tab) => {
        console.log("11. getAllChildTabs called for tab:", tab.tabId, tab.name);
        let children = [];
        if (tab.children && tab.children.length > 0) {
          console.log("12. Tab has children, processing:", tab.children.length);
          tab.children.forEach((child) => {
            console.log("13. Processing child:", child.tabId, child.name);
            children.push(child);
            children = children.concat(getAllChildTabs(child));
          });
        }
        console.log("14. Returning children array length:", children.length);
        return children;
      };

      console.log("15. Creating parent update object");
      const parentUpdate = { tabId: parentTab.tabId, isVisible };
      console.log("16. Parent update:", parentUpdate);

      console.log("17. Getting all child tabs");
      const childTabs = getAllChildTabs(parentTab);
      console.log("18. Child tabs found:", childTabs.length);

      console.log("19. Creating child updates");
      const childUpdates = childTabs.map((child) => {
        const update = { tabId: child.tabId, isVisible };
        console.log("20. Child update:", update);
        return update;
      });

      const allUpdates = [parentUpdate, ...childUpdates];
      console.log("21. All updates:", allUpdates);
      console.log("22. Total updates to send:", allUpdates.length);

      console.log("23. Making API call to backend");
      await axios.put(`${backendUrl}/api/h-tabs/visibility`, {
        updates: allUpdates,
      });
      console.log("24. API call successful");

      console.log("25. Showing success toast");
      showToast(
        "success",
        `All ${isVisible ? "shown" : "hidden"} for ${parentTab.name}`
      );
      console.log("26. handleParentTabToggle completed successfully");
    } catch (error) {
      console.error("27. Error in handleParentTabToggle:", error);
      console.log("28. Showing error toast");
      showToast("error", "Failed to update parent tab visibility");
    }
  };

  // ✅ Updated Child Toggle
  const handleChildTabToggle = async (childTab, isVisible) => {
    console.log("1. handleChildTabToggle called with:", {
      childTab,
      isVisible,
    });
    try {
      console.log("2. Updating local UI state for child tab");
      setTabHierarchy((prevTabs) => {
        console.log("3. setTabHierarchy callback started, prevTabs:", prevTabs);
        const updateVisibility = (tabs) => {
          console.log("4. updateVisibility called with tabs:", tabs);
          return tabs.map((tab) => {
            console.log("5. Processing tab:", tab.tabId, tab.name);
            if (tab.tabId === childTab.tabId) {
              console.log("6. Found matching child tab, updating visibility");
              return { ...tab, isVisible };
            }
            if (tab.children && tab.children.length > 0) {
              console.log("7. Tab has children, recursing into children");
              return { ...tab, children: updateVisibility(tab.children) };
            }
            console.log("8. Returning unchanged tab");
            return tab;
          });
        };
        const result = updateVisibility(prevTabs);
        console.log("9. setTabHierarchy result:", result);
        return result;
      });

      console.log("10. Creating update payload");
      const updatePayload = [{ tabId: childTab.tabId, isVisible }];
      console.log("11. Update payload:", updatePayload);

      console.log("12. Making API call to backend");
      await axios.put(`${backendUrl}/api/h-tabs/visibility`, {
        updates: updatePayload,
      });
      console.log("13. API call successful");

      console.log("14. Showing success toast");
      showToast(
        "success",
        `${childTab.name} ${isVisible ? "shown" : "hidden"}`
      );
      console.log("15. handleChildTabToggle completed successfully");
    } catch (error) {
      console.error("16. Error in handleChildTabToggle:", error);
      console.log("17. Showing error toast");
      showToast("error", "Failed to update child tab visibility");
    }
  };

  const renderEnhancedTabHierarchy = (tabsArray, level = 0) => {
    if (!tabsArray || tabsArray.length === 0) {
      return (
        <div className="text-center py-6 text-gray-500">
          <EyeOff size={32} className="mx-auto mb-2 text-gray-400" />
          <p>No tabs available</p>
        </div>
      );
    }

    return tabsArray.map((tab) => (
      <div key={tab._id || tab.tabId} className="mb-1">
        <div
          className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-200 group ${
            level === 0
              ? "bg-white border border-gray-300 shadow-sm hover:shadow-md"
              : "bg-gray-50 border border-gray-200 hover:bg-gray-100"
          }`}
          style={{ marginLeft: `${level * 24}px` }}
        >
          {tab.children && tab.children.length > 0 ? (
            <button
              onClick={() => toggleExpand(tab.tabId)}
              className="flex items-center justify-center w-6 h-6 rounded hover:bg-gray-200 transition-colors flex-shrink-0"
              title={expandedTabs[tab.tabId] ? "Collapse" : "Expand"}
            >
              {expandedTabs[tab.tabId] ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRightIcon size={16} />
              )}
            </button>
          ) : (
            <div className="w-6 h-6 flex items-center justify-center">
              <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
            </div>
          )}

          {/* ✅ Checkbox with new logic */}
          <input
            type="checkbox"
            checked={tab.isVisible || false}
            onChange={(e) => {
              const newValue = e.target.checked;
              if (tab.children && tab.children.length > 0) {
                handleParentTabToggle(tab, newValue);
              } else {
                handleChildTabToggle(tab, newValue);
              }
            }}
            className="w-4 h-4 cursor-pointer text-blue-600 focus:ring-blue-500"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`font-semibold truncate ${
                  level === 0
                    ? "text-gray-900 text-base"
                    : "text-gray-800 text-sm"
                }`}
              >
                {tab.name}
              </span>
              {tab.children && tab.children.length > 0 && (
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                  {tab.children.length} children
                </span>
              )}
            </div>

            {tab.description && (
              <div className="text-sm text-gray-600 line-clamp-2 mt-1">
                {tab.description}
              </div>
            )}
            {tab.path && (
              <div className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded inline-block mt-1">
                {tab.path}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className={`px-3 py-1 text-xs font-medium rounded-full border ${
                tab.isVisible
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-red-50 text-red-700 border-red-200"
              }`}
            >
              {tab.isVisible ? (
                <span className="flex items-center gap-1">
                  <Eye size={12} /> Visible
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <EyeOff size={12} /> Hidden
                </span>
              )}
            </span>
          </div>
        </div>

        {tab.children && tab.children.length > 0 && expandedTabs[tab.tabId] && (
          <div className="mt-1">
            {renderEnhancedTabHierarchy(tab.children, level + 1)}
          </div>
        )}
      </div>
    ));
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-800">HTabs Manipulation</h1>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-md mb-6 border border-gray-200">
        <div className="flex flex-wrap gap-2 mb-4">
          {reportTypes.map((type) => (
            <button
              key={type}
              onClick={() => setSelectedReportType(type)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedReportType === type
                  ? "bg-indigo-600 text-white shadow-md"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Hierarchy */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">
            Tab Hierarchy Management
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage tab visibility using the checkbox hierarchy. Parent tabs
            control their children.
          </p>
        </div>
        <div className="p-4">{renderEnhancedTabHierarchy(tabHierarchy)}</div>
      </div>
    </div>
  );
};

export default HTabsManipulation;
