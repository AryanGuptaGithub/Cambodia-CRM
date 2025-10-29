import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  ChevronRight as ChevronRightIcon,
  ArrowUp,
  ArrowDown,
  Edit,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Custom Dropdown Component (replacing SequenceDropdown)
const CustomDropdown = ({
  value,
  onChange,
  options,
  disabled,
  placeholder = "Select Sequence",
  required = false,
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
        className={`w-full border border-gray-300 rounded-md px-3 py-2 text-left focus:outline-none focus:ring-2
           focus:ring-indigo-500 disabled:bg-gray-100 flex justify-between items-center ${
             disabled
               ? "cursor-not-allowed opacity-60"
               : "cursor-pointer hover:border-gray-400"
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
  const [tabs, setTabs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sequenceLoading, setSequenceLoading] = useState(false);
  const [reportTypes, setReportTypes] = useState([
    "Hide/Show Tabs",
    "Sequence Number",
  ]);
  const [selectedReportType, setSelectedReportType] =
    useState("Hide/Show Tabs");
  const [expandedTabs, setExpandedTabs] = useState({});
  const [tabHierarchy, setTabHierarchy] = useState([]);
  const [sequenceData, setSequenceData] = useState({});
  const [initialized, setInitialized] = useState(false);
  const [editingTab, setEditingTab] = useState(null);

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
      tabsMap.set(tab.tabId, {
        ...tab,
        children: [],
        isVisible: tab.isVisible !== undefined ? tab.isVisible : true,
      });
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
        const parentCheckboxState =
          calculateParentCheckboxState(updatedChildren);

        const hasAnyVisibleChild = updatedChildren.some(
          (child) => child.isVisible === true
        );
        const shouldParentBeVisible = hasAnyVisibleChild;

        return {
          ...tab,
          children: updatedChildren,
          _checkboxState: parentCheckboxState,
          isVisible: shouldParentBeVisible,
        };
      }

      return tab;
    });
  };

  // Build hierarchy from sequence data
  const buildHierarchyFromSequenceData = (sequenceData) => {
    if (!sequenceData || !sequenceData.groups) return [];

    const allTabs = [];
    const groups = sequenceData.groups;

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

    // Now build hierarchy using the same logic as before
    return buildHierarchy(allTabs);
  };

  const fetchTabHierarchy = async () => {
    try {
      setLoading(true);

      if (selectedReportType === "Hide/Show Tabs") {
        const visibleResponse = await axios.get(
          `${backendUrl}/api/h-tabs/visible`
        );
        let visibilityMap = {};

        if (
          visibleResponse.data?.data &&
          typeof visibleResponse.data.data === "object"
        ) {
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

        const hierarchyResponse = await axios.get(
          `${backendUrl}/api/h-tabs/hierarchy`
        );
        let hierarchyData = [];

        if (hierarchyResponse.data.success) {
          hierarchyData = hierarchyResponse.data.data?.hierarchy || [];
        } else {
          const fallback = await axios.get(`${backendUrl}/api/h-tabs`);
          const tabsData =
            fallback.data?.data?.tabs || fallback.data?.tabs || [];
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
      } else if (selectedReportType === "Sequence Number") {
        const sequenceResponse = await axios.get(
          `${backendUrl}/api/h-tabs/virtual-sequences`
        );

        console.log("Sequence response:", sequenceResponse);
        if (
          sequenceResponse.data?.success &&
          sequenceResponse.data?.data?.groups
        ) {
          // Build hierarchy from sequence data for consistent display
          const sequenceHierarchy = buildHierarchyFromSequenceData(
            sequenceResponse.data.data
          );
          setTabHierarchy(sequenceHierarchy);
          // Also store the raw sequence data for sequence operations
          setSequenceData(sequenceResponse.data.data);
          console.log("Sequence hierarchy built:", sequenceHierarchy);
        } else {
          console.warn("Using fallback structure for sequence data");
          setSequenceData(sequenceResponse.data || {});
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
      showToast(
        "warning",
        "Parent toggle is only available in Hide/Show Tabs mode"
      );
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

      showToast(
        "success",
        `${parentTab.name} and ALL child tabs ${isVisible ? "shown" : "hidden"}`
      );
    } catch (error) {
      showToast("error", "Failed to update parent tab visibility");
      fetchTabHierarchy();
    }
  };

  const handleChildTabToggle = async (childTab, isVisible) => {
    if (selectedReportType !== "Hide/Show Tabs") {
      showToast(
        "warning",
        "Tab visibility toggle is only available in Hide/Show Tabs mode"
      );
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

      showToast(
        "success",
        `${childTab.name} ${isVisible ? "shown" : "hidden"}`
      );
    } catch (error) {
      showToast("error", "Failed to update child tab visibility");
      fetchTabHierarchy();
    }
  };

  // Get available sequences for a tab within its siblings - CORRECTED
  const getAvailableSequencesForTab = (tab, siblings) => {
    if (!siblings || siblings.length === 0) return [];

    const assignedSequences = new Set();
    siblings.forEach((sibling) => {
      if (sibling.virtualSequence) {
        assignedSequences.add(sibling.virtualSequence);
      }
    });

    // Find the maximum virtual sequence number in this group
    const maxSequence = Math.max(
      ...siblings.map((sibling) => sibling.virtualSequence || 0),
      0
    );

    // Generate all possible sequences - ensure we have enough options
    const totalPossibleSequences = Math.max(maxSequence, siblings.length); // Add buffer
    const allPossibleSequences = Array.from(
      { length: totalPossibleSequences },
      (_, i) => i + 1
    );

    return allPossibleSequences.map((seq) => ({
      value: seq,
      label: seq.toString(),

      disabled: assignedSequences.has(seq) && seq !== tab.virtualSequence,
    }));
  };

  // Get siblings for a tab
  const getSiblingsForTab = (tab, tabsArray, level = 0) => {
    if (level === 0) {
      // Root level tabs - all root tabs are siblings
      return tabsArray.filter((t) => !t.parentTabId);
    } else {
      // Child tabs - siblings are other children of the same parent
      return tabsArray.filter((t) => t.parentTabId === tab.parentTabId);
    }
  };

  // Handle sequence change with proper backend integration
  const handleSequenceChange = async (tab, newSequence, siblings) => {
    try {
      setSequenceLoading(true);

      // Find if any other tab in the same siblings has the target virtualSequence
      const existingTabWithSequence = siblings.find(
        (sibling) =>
          sibling.tabId !== tab.tabId &&
          sibling.virtualSequence === parseInt(newSequence)
      );

      if (existingTabWithSequence) {
        // Swap virtual sequences - call swap endpoint
        const swapResponse = await axios.post(
          `${backendUrl}/api/h-tabs/swap-sequences`,
          {
            tabId1: tab.tabId,
            tabId2: existingTabWithSequence.tabId,
          }
        );

        if (swapResponse.data.success) {
          showToast(
            "success",
            swapResponse.data.message || "Sequences swapped successfully"
          );
        } else {
          showToast(
            "error",
            swapResponse.data.message || "Failed to swap sequences"
          );
        }
      } else {
        // Simple sequence update - call update endpoint
        const updateResponse = await axios.put(
          `${backendUrl}/api/h-tabs/virtual-sequence`,
          {
            updates: [
              {
                tabId: tab.tabId,
                virtualSequence: parseInt(newSequence),
              },
            ],
          }
        );

        if (updateResponse.data.success) {
          showToast(
            "success",
            updateResponse.data.message || "Sequence updated successfully"
          );
        } else {
          showToast(
            "error",
            updateResponse.data.message || "Failed to update sequence"
          );
        }
      }

      // Refresh the data
      await fetchTabHierarchy();
    } catch (error) {
      console.error("Error updating sequence:", error);
      const errorMessage =
        error.response?.data?.message || "Failed to update sequence";
      showToast("error", errorMessage);
    } finally {
      setSequenceLoading(false);
    }
  };

  const moveSequenceUp = async (tab, siblings) => {
    if (tab.virtualSequence <= 1) return;
    await handleSequenceChange(tab, tab.virtualSequence - 1, siblings);
  };

  const moveSequenceDown = async (tab, siblings) => {
    const maxVirtualSequence = Math.max(
      ...siblings.map((sibling) => sibling.virtualSequence)
    );
    if (tab.virtualSequence >= maxVirtualSequence) return;
    await handleSequenceChange(tab, tab.virtualSequence + 1, siblings);
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

          {isParent && expandedTabs[tab.tabId] && (
            <div className="mt-1">
              {renderHideShowTabHierarchy(tab.children, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  // Recursive function to render sequence hierarchy with expandable parents
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
      const siblings = getSiblingsForTab(tab, tabsArray, level);
      const availableSequences = getAvailableSequencesForTab(tab, siblings);

      return (
        <div key={tab._id || tab.tabId} className="mb-1">
          <div
            className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-200 group ${
              level === 0
                ? "bg-white border border-gray-300 shadow-sm hover:shadow-md"
                : "bg-gray-50 border border-gray-200 hover:bg-gray-100"
            }`}
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
                  }`}
                >
                  {tab.name}
                </span>
                {isParent && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                    {tab.children.length} children
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
                    onChange={(value) =>
                      handleSequenceChange(tab, value, siblings)
                    }
                    options={availableSequences}
                    placeholder="Select sequence"
                    disabled={sequenceLoading}
                  />
                </div>
              </div>

              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Current</div>
                <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                  {tab.virtualSequence}
                </div>
              </div>

              <div className="flex items-center justify-center mt-5">
                <Edit
                  size={30}
                  className="cursor-pointer text-indigo-600 hover:text-indigo-800"
                  title="Edit sequence"
                  onClick={() => editSequence(tab)}
                />
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

    if (
      confirm("Are you sure you want to reset all tabs to default visibility?")
    ) {
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

  const toggleExpand = (tabId) => {
    setExpandedTabs((prev) => ({
      ...prev,
      [tabId]: !prev[tabId],
    }));
  };

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
              <span>
                Checked = Visible on Sidebar, Unchecked = Hidden from Sidebar
              </span>
            </div>
            <div className="flex items-center gap-2 text-yellow-800 mt-1">
              <span className="font-medium">Partial Selection:</span>
              <span>Some children visible, some hidden</span>
            </div>
            <div className="flex items-center gap-2 text-green-800 mt-1">
              <span className="font-medium">Auto Parent Hide:</span>
              <span>
                Parent automatically hides when all children are hidden
              </span>
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
              <span>
                Use dropdown to set sequences - already used sequences are
                disabled
              </span>
            </div>
            <div className="flex items-center gap-2 text-blue-800 mt-1">
              <span className="font-medium">Auto Swap:</span>
              <span>
                Selecting an occupied sequence will automatically swap with that
                tab
              </span>
            </div>
            <div className="flex items-center gap-2 text-green-800 mt-1">
              <span className="font-medium">Hierarchical View:</span>
              <span>
                Tabs are organized in expandable hierarchy for better management
              </span>
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
              : "Manage tab sequences in hierarchical view. Expand parent tabs to see and manage child tab sequences within their groups."}
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
