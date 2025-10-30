import React, { useState, useEffect, useRef } from "react";
import {
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  ChevronRight as ChevronRightIcon,
  Edit,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Custom Dropdown Component
const CustomDropdown = ({
  value,
  onChange,
  options,
  disabled,
  placeholder = "Select Sequence",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full border border-gray-300 rounded-md px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 flex justify-between items-center ${
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-gray-400"
        } ${!value ? "text-gray-500" : "text-gray-900"}`}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        {!disabled && (
          <span className="text-gray-400 flex-shrink-0 ml-2">
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        )}
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-gray-500 text-sm">
              No options available
            </div>
          ) : (
            options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  if (!option.disabled) {
                    onChange(option.value);
                    setIsOpen(false);
                  }
                }}
                className={`w-full px-3 py-2 text-left hover:bg-indigo-50 hover:text-indigo-900 transition-colors duration-150 ${
                  value === option.value
                    ? "bg-indigo-100 text-indigo-900 font-medium"
                    : "text-gray-900"
                } ${option.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                disabled={option.disabled}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const HTabsManipulation = () => {
  const [loading, setLoading] = useState(false);
  const [sequenceLoading, setSequenceLoading] = useState(false);
  const [reportTypes] = useState(["Hide/Show Tabs", "Sequence Number"]);
  const [selectedReportType, setSelectedReportType] = useState("Hide/Show Tabs");
  const [expandedTabs, setExpandedTabs] = useState({});
  const [tabHierarchy, setTabHierarchy] = useState([]);
  const [editingGroups, setEditingGroups] = useState({});
  const [initialized, setInitialized] = useState(false);

  // Find any tab with the target sequence in the same parent group
  const findTabWithSequence = (tabsArray, targetSequence, currentParentId = null) => {
    for (const tab of tabsArray) {
      const tabParentId = tab.parentTabId || "root";
      if (tab.virtualSequence === parseInt(targetSequence) && 
          tab.tabId && 
          tabParentId === currentParentId) {
        return tab;
      }
      if (tab.children && tab.children.length > 0) {
        const found = findTabWithSequence(tab.children, targetSequence, currentParentId);
        if (found) return found;
      }
    }
    return null;
  };

  // Build hierarchy from sequence data
  const buildHierarchyFromSequenceData = (sequenceData) => {
    if (!sequenceData || !sequenceData.data?.groups) return [];

    const allTabs = [];
    const groups = sequenceData.data.groups;

    // Flatten all tabs from all groups
    const flattenTabs = (tabs, parentId = null) => {
      tabs.forEach((tab) => {
        allTabs.push({
          ...tab,
          parentTabId: parentId,
        });

        if (tab.children && tab.children.length > 0) {
          flattenTabs(tab.children, tab.tabId);
        }
      });
    };

    Object.keys(groups).forEach((groupName) => {
      const groupTabs = groups[groupName];
      flattenTabs(groupTabs, groupName === "root" ? null : groupName);
    });

    return buildHierarchy(allTabs);
  };

  const buildHierarchy = (flatTabs) => {
    const tabsMap = new Map();
    const roots = [];

    flatTabs.forEach((tab) => {
      tabsMap.set(tab.tabId, {
        ...tab,
        children: [],
        isVisible: tab.isVisible !== undefined ? tab.isVisible : true,
      });
    });

    flatTabs.forEach((tab) => {
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

  const calculateParentCheckboxState = (children) => {
    if (!children || children.length === 0) return false;

    const visibleChildren = children.filter(
      (child) => child.isVisible === true
    );

    if (visibleChildren.length === 0) {
      return false;
    } else if (visibleChildren.length === children.length) {
      return true;
    } else {
      return "indeterminate";
    }
  };

  const updateParentStates = (tabsArray) => {
    return tabsArray.map((tab) => {
      if (tab.children && tab.children.length > 0) {
        const updatedChildren = updateParentStates(tab.children);
        const parentCheckboxState = calculateParentCheckboxState(updatedChildren);
        const hasAnyVisibleChild = updatedChildren.some((child) => child.isVisible === true);

        return {
          ...tab,
          children: updatedChildren,
          _checkboxState: parentCheckboxState,
          isVisible: hasAnyVisibleChild,
        };
      }
      return tab;
    });
  };

  const fetchTabHierarchy = async () => {
    try {
      setLoading(true);

      if (selectedReportType === "Hide/Show Tabs") {
        const visibleResponse = await axios.get(`${backendUrl}/api/h-tabs/visible`);
        let visibilityMap = {};

        if (visibleResponse.data?.data && typeof visibleResponse.data.data === "object") {
          visibilityMap = visibleResponse.data.data;
        } else if (Array.isArray(visibleResponse.data?.data)) {
          visibleResponse.data.data.forEach((tab) => {
            if (tab.tabId) {
              visibilityMap[tab.tabId] = {
                visible: tab.isVisible === true,
                isVisible: tab.isVisible === true,
              };
            }
          });
        }

        const hierarchyResponse = await axios.get(`${backendUrl}/api/h-tabs/hierarchy`);
        let hierarchyData = [];

        if (hierarchyResponse.data.success) {
          hierarchyData = hierarchyResponse.data.data?.hierarchy || [];
        } else {
          const fallback = await axios.get(`${backendUrl}/api/h-tabs`);
          const tabsData = fallback.data?.data?.tabs || fallback.data?.tabs || [];
          hierarchyData = buildHierarchy(tabsData);
        }

        const mergeVisibility = (tabs) => {
          return tabs.map((tab) => {
            const tabVisibility = visibilityMap[tab.tabId];
            let isVisible = false;
            
            if (tabVisibility) {
              if (tabVisibility.visible !== undefined) {
                isVisible = tabVisibility.visible === true;
              } else if (tabVisibility.isVisible !== undefined) {
                isVisible = tabVisibility.isVisible === true;
              }
            }

            if (tabVisibility === undefined) {
              isVisible = false;
            }

            return {
              ...tab,
              isVisible: isVisible,
              children: tab.children ? mergeVisibility(tab.children) : [],
            };
          });
        };

        const mergedHierarchy = mergeVisibility(hierarchyData);
        const hierarchyWithParentStates = updateParentStates(mergedHierarchy);
        setTabHierarchy(hierarchyWithParentStates);
      } else {
        const sequenceResponse = await axios.get(`${backendUrl}/api/h-tabs/virtual-sequences`);
        if (sequenceResponse.data?.success && sequenceResponse.data?.data?.groups) {
          const sequenceHierarchy = buildHierarchyFromSequenceData(sequenceResponse.data);
          setTabHierarchy(sequenceHierarchy);
        }
      }
      setInitialized(true);
    } catch (error) {
      showToast("error", "Failed to load tab data");
    } finally {
      setLoading(false);
    }
  };

  const updateAllChildrenVisibility = (tab, isVisible) => {
    const updatedTab = {
      ...tab,
      isVisible: isVisible,
      _checkboxState: isVisible,
    };

    if (tab.children && tab.children.length > 0) {
      updatedTab.children = tab.children.map((child) =>
        updateAllChildrenVisibility(child, isVisible)
      );
    }

    return updatedTab;
  };

  const handleParentTabToggle = async (parentTab, newState) => {
    if (selectedReportType !== "Hide/Show Tabs") {
      showToast("warning", "Parent toggle is only available in Hide/Show Tabs mode");
      return;
    }

    try {
      const getAllChildTabs = (tab) => {
        let children = [];
        if (tab.children && tab.children.length > 0) {
          tab.children.forEach((child) => {
            children.push(child);
            children = children.concat(getAllChildTabs(child));
          });
        }
        return children;
      };

      const allChildTabs = getAllChildTabs(parentTab);
      const isVisible = newState === true;

      setTabHierarchy((prevTabs) => {
        const updateVisibility = (tabs) => {
          return tabs.map((tab) => {
            if (tab.tabId === parentTab.tabId) {
              return updateAllChildrenVisibility(tab, isVisible);
            }

            if (tab.children && tab.children.length > 0) {
              return {
                ...tab,
                children: updateVisibility(tab.children),
              };
            }

            return tab;
          });
        };

        const updatedTabs = updateVisibility(prevTabs);
        return updateParentStates(updatedTabs);
      });

      const parentUpdate = { tabId: parentTab.tabId, isVisible: isVisible };
      const childUpdates = allChildTabs.map((child) => ({
        tabId: child.tabId,
        isVisible: isVisible,
      }));

      const allUpdates = [parentUpdate, ...childUpdates];

      await axios.put(`${backendUrl}/api/h-tabs/visibility`, {
        updates: allUpdates,
      });

      window.dispatchEvent(
        new CustomEvent("tabVisibilityChanged", {
          detail: {
            source: "hTabsManipulation",
            updates: allUpdates,
            timestamp: Date.now(),
          },
        })
      );

      localStorage.setItem("tabVisibilityUpdated", Date.now().toString());
      sessionStorage.setItem("forceSidebarRefresh", Date.now().toString());

      showToast("success", `${parentTab.name} and ALL child tabs ${isVisible ? "shown" : "hidden"}`);
    } catch (error) {
      showToast("error", "Failed to update parent tab visibility");
      fetchTabHierarchy();
    }
  };

  const handleChildTabToggle = async (childTab, isVisible) => {
    if (selectedReportType !== "Hide/Show Tabs") {
      showToast("warning", "Tab visibility toggle is only available in Hide/Show Tabs mode");
      return;
    }

    try {
      setTabHierarchy((prevTabs) => {
        const updateChildVisibility = (tabs) => {
          return tabs.map((tab) => {
            if (tab.tabId === childTab.tabId) {
              return {
                ...tab,
                isVisible: isVisible,
              };
            }

            if (tab.children && tab.children.length > 0) {
              return {
                ...tab,
                children: updateChildVisibility(tab.children),
              };
            }

            return tab;
          });
        };

        const updatedTabs = updateChildVisibility(prevTabs);
        return updateParentStates(updatedTabs);
      });

      const updatePayload = [
        {
          tabId: childTab.tabId,
          isVisible: isVisible,
        },
      ];

      await axios.put(`${backendUrl}/api/h-tabs/visibility`, {
        updates: updatePayload,
      });

      window.dispatchEvent(
        new CustomEvent("tabVisibilityChanged", {
          detail: {
            source: "hTabsManipulation",
            updates: updatePayload,
            timestamp: Date.now(),
          },
        })
      );

      localStorage.setItem("tabVisibilityUpdated", Date.now().toString());
      sessionStorage.setItem("forceSidebarRefresh", Date.now().toString());

      showToast("success", `${childTab.name} ${isVisible ? "shown" : "hidden"}`);
    } catch (error) {
      showToast("error", "Failed to update child tab visibility");
      fetchTabHierarchy();
    }
  };

  // Get siblings for a tab (only tabs with same parent)
  const getSiblingsForTab = (tab, tabsArray) => {
    const parentId = tab.parentTabId || "root";
    
    const findSiblings = (tabs, targetParentId) => {
      let siblings = [];
      
      for (const currentTab of tabs) {
        const currentParentId = currentTab.parentTabId || "root";
        
        if (currentParentId === targetParentId) {
          siblings.push(currentTab);
        }
        
        if (currentTab.children && currentTab.children.length > 0) {
          const childSiblings = findSiblings(currentTab.children, targetParentId);
          siblings = siblings.concat(childSiblings);
        }
      }
      
      return siblings;
    };
    
    return findSiblings(tabsArray, parentId);
  };

  // Get parent group ID for a tab
  const getParentGroupId = (tab) => {
    return tab.parentTabId || "root";
  };

  // Check if a tab is in edit mode
  const isTabInEditMode = (tab) => {
    const parentGroupId = getParentGroupId(tab);
    return editingGroups[parentGroupId] === true;
  };

  // Get available sequences for a tab within its siblings
  const getAvailableSequencesForTab = (tab, siblings) => {
    if (!siblings || siblings.length === 0) {
      return [];
    }

    const maxVirtualSequence = Math.max(...siblings.map((s) => s.virtualSequence || 0));
    const MAX_SEQUENCE = maxVirtualSequence > 0 ? maxVirtualSequence : 1;

    return Array.from({ length: MAX_SEQUENCE }, (_, i) => ({
      value: i + 1,
      label: (i + 1).toString(),
      disabled: false,
    }));
  };

  // CORRECTED: Handle sequence change with proper parent group restrictions
  const handleSequenceChange = async (tab, newSequence, siblings) => {
    try {
      setSequenceLoading(true);

      const parentGroupId = getParentGroupId(tab);
      
      // Find if any tab in the SAME PARENT GROUP has the target virtualSequence
      const existingTabWithSequence = findTabWithSequence(tabHierarchy, newSequence, parentGroupId);

      if (existingTabWithSequence && existingTabWithSequence.tabId !== tab.tabId) {
        // Swap sequences within same parent group
        const swapResponse = await axios.post(`${backendUrl}/api/h-tabs/swap-sequences`, {
          tabId1: tab.tabId,
          tabId2: existingTabWithSequence.tabId,
        });

        if (swapResponse.data.success) {
          showToast("success", `Sequence swapped between <b>${tab.name}</b> and <b>${existingTabWithSequence.name}</b>`);
        } else {
          showToast("error", swapResponse.data.message || "Failed to swap sequences");
        }
      } else {
        // Simple sequence update
        const updateResponse = await axios.put(`${backendUrl}/api/h-tabs/virtual-sequence`, {
          updates: [
            {
              tabId: tab.tabId,
              virtualSequence: parseInt(newSequence),
            },
          ],
        });

        if (updateResponse.data.success) {
          showToast("success", "Sequence updated successfully");
        } else {
          showToast("error", updateResponse.data.message || "Failed to update sequence");
        }
      }

      // Refresh the data
      await fetchTabHierarchy();
    } catch (error) {
      console.error("Error updating sequence:", error);
      const errorMessage = error.response?.data?.message || "Failed to update sequence";
      showToast("error", errorMessage);
    } finally {
      setSequenceLoading(false);
    }
  };

  // Edit group function - enables editing for all tabs with same parent
  const editGroup = (tab) => {
    const parentGroupId = getParentGroupId(tab);
    setEditingGroups((prev) => ({
      ...prev,
      [parentGroupId]: true,
    }));
    showToast("info", `Editing sequences for ${parentGroupId === "root" ? "root level" : "this group"} tabs`);
  };

  // Save group function
  const saveGroup = (tab) => {
    const parentGroupId = getParentGroupId(tab);
    setEditingGroups((prev) => ({
      ...prev,
      [parentGroupId]: false,
    }));
    showToast("success", `Sequences saved for ${parentGroupId === "root" ? "root level" : "this group"} tabs`);
  };

  // Cancel edit function
  const cancelEdit = (tab) => {
    const parentGroupId = getParentGroupId(tab);
    setEditingGroups((prev) => ({
      ...prev,
      [parentGroupId]: false,
    }));
    fetchTabHierarchy();
    showToast("info", `Edit cancelled for ${parentGroupId === "root" ? "root level" : "this group"} tabs`);
  };

  const renderHideShowTabHierarchy = (tabsArray, level = 0) => {
    if (!tabsArray || tabsArray.length === 0) {
      return (
        <div className="text-center py-6 text-gray-500">
          <EyeOff size={32} className="mx-auto mb-2 text-gray-400" />
          <p>No tabs available</p>
        </div>
      );
    }

    return tabsArray.map((tab) => {
      const isParent = tab.children && tab.children.length > 0;
      const checkboxState = isParent ? tab._checkboxState : tab.isVisible;

      return (
        <div key={tab._id || tab.tabId} className="mb-1">
          <div
            className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-200 group ${
              level === 0
                ? "bg-white border border-gray-300 shadow-sm hover:shadow-md"
                : "bg-gray-50 border border-gray-200 hover:bg-gray-100"
            } ${!tab.isVisible ? "opacity-70 bg-gray-100" : ""}`}
            style={{ marginLeft: `${level * 24}px` }}
          >
            {isParent ? (
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

            <input
              type="checkbox"
              checked={checkboxState === true}
              ref={(el) => {
                if (el && checkboxState === "indeterminate") {
                  el.indeterminate = true;
                } else if (el) {
                  el.indeterminate = false;
                }
              }}
              onChange={(e) => {
                const newValue = e.target.checked;
                if (isParent) {
                  handleParentTabToggle(tab, newValue);
                } else {
                  handleChildTabToggle(tab, newValue);
                }
              }}
              className="w-4 h-4 cursor-pointer text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              id={`checkbox-${tab.tabId}`}
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <label
                  htmlFor={`checkbox-${tab.tabId}`}
                  className={`font-semibold truncate cursor-pointer ${
                    level === 0
                      ? "text-gray-900 text-base"
                      : "text-gray-800 text-sm"
                  } ${!tab.isVisible ? "text-gray-500" : ""}`}
                >
                  {tab.name}
                </label>
                {isParent && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                    {tab.children.length} children
                  </span>
                )}
                {checkboxState === "indeterminate" && (
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                    Partial
                  </span>
                )}
              </div>

              {tab.description && (
                <div
                  className={`text-sm mt-1 ${
                    !tab.isVisible ? "text-gray-400" : "text-gray-600"
                  } line-clamp-2`}
                >
                  {tab.description}
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

          {isParent && expandedTabs[tab.tabId] && (
            <div className="mt-1">
              {renderHideShowTabHierarchy(tab.children, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  // Recursive function to render sequence hierarchy
  const renderSequenceNumberHierarchy = (tabsArray, level = 0) => {
    if (!tabsArray || tabsArray.length === 0) {
      return (
        <div className="text-center py-6 text-gray-500">
          <EyeOff size={32} className="mx-auto mb-2 text-gray-400" />
          <p>No tabs available for sequence management</p>
        </div>
      );
    }

    return tabsArray.map((tab) => {
      const isParent = tab.children && tab.children.length > 0;
      const siblings = getSiblingsForTab(tab, tabHierarchy);
      const isEditingGroup = isTabInEditMode(tab);
      const availableSequences = getAvailableSequencesForTab(tab, siblings);

      return (
        <div key={tab._id || tab.tabId} className="mb-1">
          <div
            className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-200 group ${
              level === 0
                ? "bg-white border border-gray-300 shadow-sm hover:shadow-md"
                : "bg-gray-50 border border-gray-200 hover:bg-gray-100"
            } ${isEditingGroup ? "ring-2 ring-indigo-500 bg-indigo-50" : ""}`}
            style={{ marginLeft: `${level * 24}px` }}
          >
            {isParent ? (
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

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`font-semibold truncate ${
                    level === 0
                      ? "text-gray-900 text-base"
                      : "text-gray-800 text-sm"
                  } ${isEditingGroup ? "text-indigo-700" : ""}`}
                >
                  {tab.name}
                </span>
                {isParent && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                    {tab.children.length} children
                  </span>
                )}
                {level > 0 && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    Parent: {tab.parentTabId}
                  </span>
                )}
              </div>

              {tab.description && (
                <div className="text-sm mt-1 text-gray-600 line-clamp-2">
                  {tab.description}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="min-w-[120px]">
                  <div className="text-xs text-gray-500 mb-1">Set Sequence</div>
                  <CustomDropdown
                    value={tab.virtualSequence}
                    onChange={(value) => handleSequenceChange(tab, value, siblings)}
                    options={availableSequences}
                    placeholder="Not Set"
                    disabled={sequenceLoading || !isEditingGroup}
                  />
                </div>
              </div>

              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Current</div>
                <div
                  className={`px-3 py-1 rounded text-sm font-medium ${
                    isEditingGroup
                      ? "bg-indigo-100 text-indigo-800 border border-indigo-300"
                      : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {tab.virtualSequence || "Not Set"}
                </div>
              </div>

              {/* EDIT BUTTON FOR EVERY TAB */}
              <div className="flex items-center gap-2">
                {isEditingGroup ? (
                  // Show Save/Cancel buttons when in edit mode (only once per group)
                  tab.tabId === siblings[0]?.tabId && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => cancelEdit(tab)}
                        className="px-3 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveGroup(tab)}
                        className="px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                        disabled={sequenceLoading}
                      >
                        Save Group
                      </button>
                    </div>
                  )
                ) : (
                  // Show Edit button for EVERY tab
                  <Edit
                    size={20}
                    className="cursor-pointer text-indigo-600 hover:text-indigo-800 mt-5"
                    title={`Edit sequences for ${getParentGroupId(tab) === "root" ? "root" : "this"} group`}
                    onClick={() => editGroup(tab)}
                  />
                )}
              </div>
            </div>
          </div>

          {isParent && expandedTabs[tab.tabId] && (
            <div className="mt-1">
              {renderSequenceNumberHierarchy(tab.children, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const handleResetToDefault = async () => {
    if (selectedReportType !== "Hide/Show Tabs") {
      showToast("warning", "Reset is only available in Hide/Show Tabs mode");
      return;
    }

    if (confirm("Are you sure you want to reset all tabs to default visibility?")) {
      try {
        setLoading(true);
        await axios.post(`${backendUrl}/api/h-tabs/reset-visibility`);
        showToast("success", "All tabs reset to default visibility");
        fetchTabHierarchy();

        window.dispatchEvent(
          new CustomEvent("tabVisibilityChanged", {
            detail: { reset: true, timestamp: Date.now() },
          })
        );
      } catch (error) {
        showToast("error", "Failed to reset tabs");
      } finally {
        setLoading(false);
      }
    }
  };

  const toggleExpand = (tabId) => {
    setExpandedTabs((prev) => ({
      ...prev,
      [tabId]: !prev[tabId],
    }));
  };

  useEffect(() => {
    fetchTabHierarchy();
  }, [selectedReportType]);

  useEffect(() => {
    if (tabHierarchy.length > 0 && !initialized) {
      const expandAll = (tabs) => {
        const expanded = {};
        tabs.forEach((tab) => {
          if (tab.children && tab.children.length > 0) {
            expanded[tab.tabId] = true;
            const childExpanded = expandAll(tab.children);
            Object.assign(expanded, childExpanded);
          }
        });
        return expanded;
      };

      setExpandedTabs(expandAll(tabHierarchy));
      setInitialized(true);
    }
  }, [tabHierarchy, initialized]);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-800">HTabs Manipulation</h1>
        <div className="flex gap-2">
          <button
            onClick={handleResetToDefault}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2"
            disabled={loading}
          >
            Reset to Default
          </button>
        </div>
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

        {selectedReportType === "Hide/Show Tabs" && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-blue-800">
              <Eye size={16} />
              <span className="font-medium">Visibility Status:</span>
              <span>Checked = Visible on Sidebar, Unchecked = Hidden from Sidebar</span>
            </div>
            <div className="flex items-center gap-2 text-yellow-800 mt-1">
              <span className="font-medium">Partial Selection:</span>
              <span>Some children visible, some hidden</span>
            </div>
            <div className="flex items-center gap-2 text-green-800 mt-1">
              <span className="font-medium">Auto Parent Hide:</span>
              <span>Parent automatically hides when all children are hidden</span>
            </div>
            <div className="flex items-center gap-2 text-purple-800 mt-1">
              <span className="font-medium">Cascade Effect:</span>
              <span>Parent toggle affects ALL children and sub-children</span>
            </div>
          </div>
        )}

        {selectedReportType === "Sequence Number" && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-purple-800">
              <span className="font-medium">Sequence Management:</span>
              <span>Click edit icon on ANY tab to edit entire group sequences</span>
            </div>
            <div className="flex items-center gap-2 text-blue-800 mt-1">
              <span className="font-medium">Group-Based Editing:</span>
              <span>Editing affects only tabs within the same parent group</span>
            </div>
            <div className="flex items-center gap-2 text-green-800 mt-1">
              <span className="font-medium">Parent Restrictions:</span>
              <span>Root tabs can only swap with root tabs, children with children</span>
            </div>
            <div className="flex items-center gap-2 text-indigo-800 mt-1">
              <span className="font-medium">Same-Group Swapping:</span>
              <span>Sequences can only be swapped between tabs from the same parent group</span>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-md border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">
            {selectedReportType === "Hide/Show Tabs"
              ? "Tab Visibility Management"
              : "Tab Sequence Management"}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {selectedReportType === "Hide/Show Tabs"
              ? "Manage tab visibility using the checkbox hierarchy. Parent tabs automatically hide when all children are hidden and affect ALL nested children."
              : "Manage tab sequences in hierarchical view. Sequences can only be swapped between tabs from the same parent group."}
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-2">Loading tab data...</p>
          </div>
        ) : (
          <div className="p-4 max-h-[600px] overflow-y-auto">
            {selectedReportType === "Hide/Show Tabs"
              ? renderHideShowTabHierarchy(tabHierarchy)
              : renderSequenceNumberHierarchy(tabHierarchy)}
          </div>
        )}
      </div>
    </div>
  );
};

export default HTabsManipulation;