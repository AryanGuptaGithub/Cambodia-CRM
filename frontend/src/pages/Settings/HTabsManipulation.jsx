import React, { useState, useEffect, useRef } from "react";
import {
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const HTabsManipulation = () => {
  const [tabs, setTabs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reportTypes, setReportTypes] = useState([
    "Hide/Show Tabs",
    "Sequence Number",
  ]);
  const [selectedReportType, setSelectedReportType] = useState("Hide/Show Tabs");
  const [expandedTabs, setExpandedTabs] = useState({});
  const [tabHierarchy, setTabHierarchy] = useState([]);
  const [initialized, setInitialized] = useState(false);

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
        isVisible: tab.isVisible !== undefined ? tab.isVisible : true
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

  // ✅ FIXED: Calculate parent checkbox state for UI only
  const calculateParentCheckboxState = (children) => {
    if (!children || children.length === 0) return false;
    
    const visibleChildren = children.filter(child => child.isVisible === true);
    
    if (visibleChildren.length === 0) {
      return false; // All children unchecked
    } else if (visibleChildren.length === children.length) {
      return true; // All children checked
    } else {
      return "indeterminate"; // Some children checked
    }
  };

  // ✅ FIXED: Update parent checkbox states only (for UI), don't change parent visibility
  const updateParentCheckboxStates = (tabsArray) => {
    return tabsArray.map(tab => {
      if (tab.children && tab.children.length > 0) {
        const updatedChildren = updateParentCheckboxStates(tab.children);
        const parentCheckboxState = calculateParentCheckboxState(updatedChildren);
        
        return {
          ...tab,
          children: updatedChildren,
          // ✅ CRITICAL FIX: Keep the original isVisible for parent, only update checkbox state for UI
          _checkboxState: parentCheckboxState
        };
      }
      
      return tab;
    });
  };

  // ✅ FIXED: Enhanced hierarchy fetch
  const fetchTabHierarchy = async () => {
    try {
      setLoading(true);
      
      // First fetch current visibility state
      const visibleResponse = await axios.get(`${backendUrl}/api/h-tabs/visible`);
      let visibilityMap = {};
      
      console.log("Visibility API Response:", visibleResponse.data);

      if (visibleResponse.data?.data && typeof visibleResponse.data.data === 'object') {
        visibilityMap = visibleResponse.data.data;
      } else if (Array.isArray(visibleResponse.data?.data)) {
        visibleResponse.data.data.forEach(tab => {
          if (tab.tabId) {
            visibilityMap[tab.tabId] = { 
              visible: tab.isVisible === true,
              isVisible: tab.isVisible === true 
            };
          }
        });
      }

      console.log("Processed Visibility Map:", visibilityMap);

      // Then fetch hierarchy structure
      const hierarchyResponse = await axios.get(`${backendUrl}/api/h-tabs/hierarchy`);
      let hierarchyData = [];
      
      if (hierarchyResponse.data.success) {
        hierarchyData = hierarchyResponse.data.data?.hierarchy || [];
      } else {
        const fallback = await axios.get(`${backendUrl}/api/h-tabs`);
        const tabsData = fallback.data?.data?.tabs || fallback.data?.tabs || [];
        hierarchyData = buildHierarchy(tabsData);
      }

      // Enhanced visibility merging with strict boolean handling
      const mergeVisibility = (tabs) => {
        return tabs.map(tab => {
          const tabVisibility = visibilityMap[tab.tabId];
          
          // Strict boolean handling - only true if explicitly true
          let isVisible = false;
          if (tabVisibility) {
            if (tabVisibility.visible !== undefined) {
              isVisible = tabVisibility.visible === true;
            } else if (tabVisibility.isVisible !== undefined) {
              isVisible = tabVisibility.isVisible === true;
            }
          }
          
          // If no visibility data found, default to false (hidden)
          if (tabVisibility === undefined) {
            isVisible = false;
          }

          console.log(`Tab ${tab.tabId} visibility:`, { 
            tabId: tab.tabId, 
            name: tab.name,
            tabVisibility,
            finalVisibility: isVisible 
          });

          return {
            ...tab,
            isVisible: isVisible,
            children: tab.children ? mergeVisibility(tab.children) : []
          };
        });
      };

      const mergedHierarchy = mergeVisibility(hierarchyData);
      
      // ✅ FIXED: Update parent checkbox states only (for UI)
      const hierarchyWithParentStates = updateParentCheckboxStates(mergedHierarchy);
      
      setTabHierarchy(hierarchyWithParentStates);
      setInitialized(true);
      
      console.log("Final Tab Hierarchy:", hierarchyWithParentStates);
      
    } catch (error) {
      console.error("Error fetching hierarchy:", error);
      
      // Fallback: fetch basic tabs and build hierarchy
      try {
        const fallback = await axios.get(`${backendUrl}/api/h-tabs`);
        const tabsData = fallback.data?.data?.tabs || fallback.data?.tabs || [];
        const hierarchy = buildHierarchy(tabsData);
        const hierarchyWithParentStates = updateParentCheckboxStates(hierarchy);
        setTabHierarchy(hierarchyWithParentStates);
      } catch (fallbackError) {
        console.error("Fallback fetch failed:", fallbackError);
        showToast("error", "Failed to load tab hierarchy");
      }
    } finally {
      setLoading(false);
    }
  };

  // ✅ FIXED: Enhanced Parent Toggle - now properly sets parent isVisible to false when unchecked
  const handleParentTabToggle = async (parentTab, newState) => {
    try {
      console.log(`Toggling parent tab ${parentTab.name} to:`, newState);

      // Get all child tabs recursively
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

      const childTabs = getAllChildTabs(parentTab);
      const isVisible = newState === true;

      // Update UI state immediately
      setTabHierarchy((prevTabs) => {
        const updateVisibility = (tabs) => {
          return tabs.map((tab) => {
            if (tab.tabId === parentTab.tabId) {
              // ✅ CRITICAL FIX: Update parent isVisible to the new state
              const updatedChildren = (tab.children || []).map(child => ({
                ...child,
                isVisible: isVisible
              }));
              return {
                ...tab,
                isVisible: isVisible, // ✅ Parent visibility changes with checkbox
                _checkboxState: isVisible,
                children: updatedChildren
              };
            }
            
            // Check children recursively
            if (tab.children && tab.children.length > 0) {
              const updatedChildren = updateVisibility(tab.children);
              
              // Recalculate checkbox state for this parent
              const parentCheckboxState = calculateParentCheckboxState(updatedChildren);
              
              return { 
                ...tab, 
                children: updatedChildren,
                // ✅ FIXED: Keep the original isVisible for other parents, only update checkbox state
                _checkboxState: parentCheckboxState
              };
            }
            
            return tab;
          });
        };
        
        const updatedTabs = updateVisibility(prevTabs);
        return updateParentCheckboxStates(updatedTabs);
      });

      // ✅ FIXED: Prepare backend payload - include parent AND children
      const parentUpdate = { tabId: parentTab.tabId, isVisible: isVisible };
      const childUpdates = childTabs.map((child) => ({
        tabId: child.tabId, 
        isVisible: isVisible
      }));

      const allUpdates = [parentUpdate, ...childUpdates];

      console.log("Sending updates to backend:", allUpdates);

      // Send update to backend
      await axios.put(`${backendUrl}/api/h-tabs/visibility`, {
        updates: allUpdates,
      });

      // Enhanced event dispatch for immediate sidebar refresh
      window.dispatchEvent(new CustomEvent('tabVisibilityChanged', { 
        detail: { 
          source: 'hTabsManipulation',
          updates: allUpdates,
          timestamp: Date.now()
        } 
      }));
      
      // Multiple backup mechanisms
      localStorage.setItem('tabVisibilityUpdated', Date.now().toString());
      sessionStorage.setItem('forceSidebarRefresh', Date.now().toString());

      showToast(
        "success",
        `${parentTab.name} and all child tabs ${isVisible ? "shown" : "hidden"}`
      );
      
    } catch (error) {
      console.error("Error updating parent tab visibility:", error);
      showToast("error", "Failed to update parent tab visibility");
      
      // Revert state on error
      fetchTabHierarchy();
    }
  };

  // ✅ FIXED: Enhanced Child Toggle with parent checkbox state recalculation
  const handleChildTabToggle = async (childTab, isVisible) => {
    try {
      console.log(`Toggling child tab ${childTab.name} to:`, isVisible);

      // Update UI state immediately
      setTabHierarchy((prevTabs) => {
        const updateVisibility = (tabs) => {
          return tabs.map((tab) => {
            if (tab.tabId === childTab.tabId) {
              return { 
                ...tab, 
                isVisible: isVisible
              };
            }
            
            // Check children recursively
            if (tab.children && tab.children.length > 0) {
              const updatedChildren = updateVisibility(tab.children);
              const parentCheckboxState = calculateParentCheckboxState(updatedChildren);
              
              return { 
                ...tab, 
                children: updatedChildren,
                // ✅ FIXED: Only update checkbox state, keep isVisible as is for parents
                _checkboxState: parentCheckboxState
              };
            }
            
            return tab;
          });
        };
        
        const updatedTabs = updateVisibility(prevTabs);
        return updateParentCheckboxStates(updatedTabs);
      });

      const updatePayload = [{ 
        tabId: childTab.tabId, 
        isVisible: isVisible
      }];

      console.log("Sending child update to backend:", updatePayload);

      // Send update to backend
      await axios.put(`${backendUrl}/api/h-tabs/visibility`, {
        updates: updatePayload,
      });

      // Enhanced event dispatch for immediate sidebar refresh
      window.dispatchEvent(new CustomEvent('tabVisibilityChanged', { 
        detail: { 
          source: 'hTabsManipulation',
          updates: updatePayload,
          timestamp: Date.now()
        } 
      }));
      
      // Multiple backup mechanisms
      localStorage.setItem('tabVisibilityUpdated', Date.now().toString());
      sessionStorage.setItem('forceSidebarRefresh', Date.now().toString());

      showToast(
        "success",
        `${childTab.name} ${isVisible ? "shown" : "hidden"}`
      );
      
    } catch (error) {
      console.error("Error updating child tab visibility:", error);
      showToast("error", "Failed to update child tab visibility");
      
      // Revert state on error
      fetchTabHierarchy();
    }
  };

  // ✅ FIXED: Enhanced render with proper checkbox state handling
  const renderEnhancedTabHierarchy = (tabsArray, level = 0) => {
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
      
      // ✅ CRITICAL FIX: For parents, use _checkboxState for UI, but isVisible for actual visibility
      // For children, use isVisible directly
      const checkboxState = isParent ? tab._checkboxState : tab.isVisible;
      
      return (
        <div key={tab._id || tab.tabId} className="mb-1">
          <div
            className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-200 group ${
              level === 0
                ? "bg-white border border-gray-300 shadow-sm hover:shadow-md"
                : "bg-gray-50 border border-gray-200 hover:bg-gray-100"
            } ${
              !tab.isVisible ? "opacity-70 bg-gray-100" : ""
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

            {/* ✅ FIXED: Enhanced checkbox with proper state handling */}
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
                console.log(`Toggling ${tab.name} (${tab.tabId}) from ${checkboxState} to:`, newValue);
                
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
                  } ${
                    !tab.isVisible ? "text-gray-500" : ""
                  }`}
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
                <div className={`text-sm mt-1 ${
                  !tab.isVisible ? "text-gray-400" : "text-gray-600"
                } line-clamp-2`}>
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
              {renderEnhancedTabHierarchy(tab.children, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const handleResetToDefault = async () => {
    if (confirm("Are you sure you want to reset all tabs to default visibility?")) {
      try {
        setLoading(true);
        await axios.post(`${backendUrl}/api/h-tabs/reset-visibility`);
        showToast("success", "All tabs reset to default visibility");
        fetchTabHierarchy();
        
        window.dispatchEvent(new CustomEvent('tabVisibilityChanged', { 
          detail: { reset: true, timestamp: Date.now() } 
        }));
      } catch (error) {
        console.error("Error resetting tabs:", error);
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
        tabs.forEach(tab => {
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
        
        {/* Status Information */}
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
        </div>
      </div>

      {/* Hierarchy */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">
            Tab Hierarchy Management
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage tab visibility using the checkbox hierarchy. Parent tabs control their children.
            Changes are reflected immediately.
          </p>
        </div>
        
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-2">Loading tab hierarchy...</p>
          </div>
        ) : (
          <div className="p-4 max-h-[600px] overflow-y-auto">
            {renderEnhancedTabHierarchy(tabHierarchy)}
          </div>
        )}
      </div>
    </div>
  );
};

export default HTabsManipulation;