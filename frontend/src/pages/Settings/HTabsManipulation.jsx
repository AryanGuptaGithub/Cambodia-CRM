import React, { useState, useEffect, useRef } from "react";
import {
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  ChevronRight as ChevronRightIcon,
  Edit,
  RotateCcw,
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
                    : option.disabled
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "text-gray-900"
                } `}
              >
                {option.label}
                {option.disabled && (
                  <span className="text-xs text-gray-500 ml-2">(Taken)</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// EditSequenceModal with UNIQUE SEQUENCE ENFORCEMENT + VISUAL FEEDBACK
// EditSequenceModal with UNIQUE SEQUENCE ENFORCEMENT + VISUAL FEEDBACK
// const EditSequenceModal = ({
//   isOpen,
//   onClose,
//   tab,
//   siblings,
//   onSave,
//   onSwap,
//   onReset,
// }) => {
//   const [localSequences, setLocalSequences] = useState({});
//   const [swapSelections, setSwapSelections] = useState({
//     firstTab: null,
//     secondTab: null,
//   });
//   const [manualAssignments, setManualAssignments] = useState([]);
//   const [collectionOfAssignedSequence, setCollectionOfAssignedSequence] = useState(new Set());

//   // Initialize assignments when modal opens
//   useEffect(() => {
//     if (isOpen && siblings) {
//       const initialSequences = {};
//       const initialAssignments = siblings.map((sibling) => ({
//         tabId: sibling.tabId,
//         name: sibling.name,
//         currentSequence: sibling.virtualSequence,
//         assignedSequence: sibling.virtualSequence,
//       }));

//       siblings.forEach((sibling) => {
//         initialSequences[sibling.tabId] = sibling.virtualSequence;
//       });

//       setLocalSequences(initialSequences);
//       setManualAssignments(initialAssignments);
//       setSwapSelections({ firstTab: null, secondTab: null });

//       // Initialize collection with current sequences
//       const initialAssigned = new Set(
//         siblings
//           .filter(sibling => sibling.virtualSequence !== null && sibling.virtualSequence !== undefined)
//           .map(sibling => sibling.virtualSequence)
//       );
//       setCollectionOfAssignedSequence(initialAssigned);
//     }
//   }, [isOpen, siblings]);

//   if (!isOpen) return null;

//   // Generate dropdown options for a specific row (exclude taken sequences)
//   const getOptionsForRow = (currentTabId) => {
//     const maxSeq = siblings.length;

//     // Use collectionOfAssignedSequence to determine taken sequences
//     const takenSequences = new Set(collectionOfAssignedSequence);

//     // Remove current tab's assigned sequence from taken sequences so it can select its own value
//     const currentAssignment = manualAssignments.find(a => a.tabId === currentTabId);
//     if (currentAssignment && currentAssignment.assignedSequence) {
//       takenSequences.delete(currentAssignment.assignedSequence);
//     }

//     const options = Array.from({ length: maxSeq }, (_, i) => {
//       const seq = i + 1;
//       const isTakenByOthers = takenSequences.has(seq);

//       return {
//         value: seq,
//         label: seq.toString(),
//         disabled: isTakenByOthers,
//       };
//     });

//     return options;
//   };

//   const handleSequenceChange = (tabId, newSequence) => {
//     const seq = parseInt(newSequence, 10);

//     // Update local sequences
//     setLocalSequences((prev) => ({ ...prev, [tabId]: seq }));

//     // Update manual assignments
//     setManualAssignments((prev) =>
//       prev.map((a) => (a.tabId === tabId ? { ...a, assignedSequence: seq } : a))
//     );

//     // Update collection of assigned sequences
//     setCollectionOfAssignedSequence(prev => {
//       const newCollection = new Set(prev);

//       // Remove the old sequence for this tab (if any)
//       const oldSequence = localSequences[tabId];
//       if (oldSequence) {
//         newCollection.delete(oldSequence);
//       }

//       // Add the new sequence
//       newCollection.add(seq);

//       return newCollection;
//     });
//   };

//   const handleSwapSelectionChange = (field, tabId) => {
//     setSwapSelections((prev) => ({
//       ...prev,
//       [field]: tabId,
//     }));
//   };

//   const handleSwap = () => {
//     if (
//       swapSelections.firstTab &&
//       swapSelections.secondTab &&
//       swapSelections.firstTab !== swapSelections.secondTab
//     ) {
//       const t1 = swapSelections.firstTab;
//       const t2 = swapSelections.secondTab;
//       const s1 = localSequences[t1];
//       const s2 = localSequences[t2];

//       setLocalSequences((prev) => ({
//         ...prev,
//         [t1]: s2,
//         [t2]: s1,
//       }));

//       setManualAssignments((prev) =>
//         prev.map((a) => {
//           if (a.tabId === t1) return { ...a, assignedSequence: s2 };
//           if (a.tabId === t2) return { ...a, assignedSequence: s1 };
//           return a;
//         })
//       );

//       // Update collection for swap
//       setCollectionOfAssignedSequence(prev => {
//         const newCollection = new Set(prev);
//         newCollection.delete(s1);
//         newCollection.delete(s2);
//         newCollection.add(s1);
//         newCollection.add(s2);
//         return newCollection;
//       });

//       setSwapSelections({ firstTab: null, secondTab: null });
//       onSwap([t1, t2]);
//     }
//   };

//   const handleSave = () => {
//     const updates = Object.entries(localSequences).map(
//       ([tabId, virtualSequence]) => ({
//         tabId,
//         virtualSequence,
//       })
//     );
//     onSave(updates);
//   };

//   const handleReset = () => {
//     onReset();
//     onClose();
//   };

//   const swapTabOptions =
//     siblings?.map((s) => ({
//       value: s.tabId,
//       label: s.name,
//       disabled: false,
//     })) || [];

//   return (
//     <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
//       <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[80vh] overflow-y-auto">
//         <div className="flex justify-between items-center mb-4">
//           <h3 className="text-lg font-semibold">
//             Edit Sequences for {tab?.name}'s Group
//           </h3>
//           <button
//             onClick={onClose}
//             className="text-gray-500 hover:text-gray-700"
//           >
//             ×
//           </button>
//         </div>

//         {/* Swap Section */}
//         <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
//           <div className="flex items-center gap-2 mb-3">
//             <Edit size={20} className="text-yellow-600" />
//             <h4 className="font-medium text-yellow-800">Swap Sequences</h4>
//           </div>
//           <p className="text-sm text-yellow-700 mb-3">
//             Select two different tabs to swap their sequences
//           </p>
//           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
//             <div>
//               <label className="block text-sm font-medium text-gray-700 mb-1">
//                 First Tab
//               </label>
//               <CustomDropdown
//                 value={swapSelections.firstTab}
//                 onChange={(value) =>
//                   handleSwapSelectionChange("firstTab", value)
//                 }
//                 options={swapTabOptions}
//                 placeholder="Select first tab"
//                 disabled={false}
//               />
//             </div>
//             <div>
//               <label className="block text-sm font-medium text-gray-700 mb-1">
//                 Second Tab
//               </label>
//               <CustomDropdown
//                 value={swapSelections.secondTab}
//                 onChange={(value) =>
//                   handleSwapSelectionChange("secondTab", value)
//                 }
//                 options={swapTabOptions}
//                 placeholder="Select second tab"
//                 disabled={false}
//               />
//             </div>
//           </div>

//           {(swapSelections.firstTab || swapSelections.secondTab) && (
//             <div className="mb-3 p-3 bg-white border border-gray-200 rounded">
//               <h5 className="text-sm font-medium text-gray-700 mb-2">
//                 Selected for Swap:
//               </h5>
//               <div className="flex gap-4 text-sm">
//                 {swapSelections.firstTab && (
//                   <div>
//                     <span className="font-medium">First:</span>{" "}
//                     {
//                       siblings?.find((s) => s.tabId === swapSelections.firstTab)
//                         ?.name
//                     }
//                     <span className="ml-2 text-gray-500">
//                       (Current: {localSequences[swapSelections.firstTab]})
//                     </span>
//                   </div>
//                 )}
//                 {swapSelections.secondTab && (
//                   <div>
//                     <span className="font-medium">Second:</span>{" "}
//                     {
//                       siblings?.find(
//                         (s) => s.tabId === swapSelections.secondTab
//                       )?.name
//                     }
//                     <span className="ml-2 text-gray-500">
//                       (Current: {localSequences[swapSelections.secondTab]})
//                     </span>
//                   </div>
//                 )}
//               </div>
//             </div>
//           )}

//           <button
//             onClick={handleSwap}
//             disabled={
//               !swapSelections.firstTab ||
//               !swapSelections.secondTab ||
//               swapSelections.firstTab === swapSelections.secondTab
//             }
//             className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
//           >
//             <Edit size={16} />
//             Swap Selected Tabs
//           </button>
//         </div>

//         {/* Manual Sequence Assignment */}
//         <div className="mb-6">
//           <h4 className="font-medium mb-3">Manual Sequence Assignment</h4>

//           <div className="mb-4 bg-white border border-gray-200 rounded-lg overflow-hidden">
//             <table className="min-w-full divide-y divide-gray-200">
//               <thead className="bg-gray-50">
//                 <tr>
//                   <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
//                     Tab Name
//                   </th>
//                   <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
//                     Current Sequence
//                   </th>
//                   <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
//                     Assigned Sequence
//                   </th>
//                   <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
//                     Select New Sequence
//                   </th>
//                 </tr>
//               </thead>
//               <tbody className="bg-white divide-y divide-gray-200">
//                 {manualAssignments.map((assignment) => {
//                   const rowOptions = getOptionsForRow(assignment.tabId);

//                   return (
//                     <tr key={assignment.tabId} className="hover:bg-gray-50">
//                       <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
//                         {assignment.name}
//                       </td>
//                       <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
//                         <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
//                           {assignment.currentSequence}
//                         </span>
//                       </td>
//                       <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
//                         <span
//                           className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
//                             assignment.assignedSequence ===
//                             assignment.currentSequence
//                               ? "bg-gray-100 text-gray-800"
//                               : "bg-green-100 text-green-800"
//                           }`}
//                         >
//                           {assignment.assignedSequence}
//                           {assignment.assignedSequence !==
//                             assignment.currentSequence && (
//                             <span className="ml-1">✓</span>
//                           )}
//                         </span>
//                       </td>
//                       <td className="px-4 py-3 text-sm text-gray-500">
//                         <CustomDropdown
//                           value={assignment.assignedSequence}
//                           onChange={(value) =>
//                             handleSequenceChange(assignment.tabId, value)
//                           }
//                           options={rowOptions}
//                           placeholder="Select sequence"
//                         />
//                       </td>
//                     </tr>
//                   );
//                 })}
//               </tbody>
//             </table>
//           </div>

//           {/* Legend */}
//           <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
//             <div className="flex items-center gap-4 text-xs">
//               <div className="flex items-center gap-1">
//                 <div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded"></div>
//                 <span className="text-gray-600">Current Sequence</span>
//               </div>
//               <div className="flex items-center gap-1">
//                 <div className="w-3 h-3 bg-green-100 border border-green-300 rounded"></div>
//                 <span className="text-gray-600">Modified Sequence</span>
//               </div>
//               <div className="flex items-center gap-1">
//                 <div className="w-3 h-3 bg-gray-100 border border-gray-300 rounded"></div>
//                 <span className="text-gray-600">Unchanged Sequence</span>
//               </div>
//               <div className="flex items-center gap-1">
//                 <div className="w-3 h-3 bg-red-100 border border-red-300 rounded"></div>
//                 <span className="text-gray-600">Taken Sequence (Disabled)</span>
//               </div>
//             </div>
//           </div>
//         </div>

//         {/* Action Buttons */}
//         <div className="flex justify-between gap-3">
//           <button
//             onClick={handleReset}
//             className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 flex items-center gap-2"
//           >
//             <RotateCcw size={16} />
//             Reset to Default
//           </button>
//           <div className="flex gap-3">
//             <button
//               onClick={onClose}
//               className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
//             >
//               Cancel
//             </button>
//             <button
//               onClick={handleSave}
//               className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2"
//             >
//               Save Changes
//             </button>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };
const EditSequenceModal = ({
  isOpen,
  onClose,
  tab,
  siblings,
  onSave,
  onSwap,
  onReset,
}) => {
  const [localSequences, setLocalSequences] = useState({});
  const [swapSelections, setSwapSelections] = useState({
    firstTab: null,
    secondTab: null,
  });
  const [manualAssignments, setManualAssignments] = useState([]);
  const [assignedSequences, setAssignedSequences] = useState(new Set()); // Track assigned sequences
  const [hasUserMadeChanges, setHasUserMadeChanges] = useState(false); // Track if user made any changes

  // Initialize assignments when modal opens
  useEffect(() => {
    if (isOpen && siblings) {
      const initialSequences = {};
      const initialAssignments = siblings.map((sibling) => ({
        tabId: sibling.tabId,
        name: sibling.name,
        currentSequence: sibling.virtualSequence,
        assignedSequence: sibling.virtualSequence, // Start with current sequence
      }));

      siblings.forEach((sibling) => {
        initialSequences[sibling.tabId] = sibling.virtualSequence;
      });

      setLocalSequences(initialSequences);
      setManualAssignments(initialAssignments);
      setSwapSelections({ firstTab: null, secondTab: null });
      setHasUserMadeChanges(false);

      // Start with empty assigned sequences - only track user changes
      setAssignedSequences(new Set());
    }
  }, [isOpen, siblings]);

  if (!isOpen) return null;

  // Generate dropdown options for a specific row (exclude taken sequences)
  const getOptionsForRow = (currentTabId) => {
    const maxSeq = siblings.length;

    // Get current assignment for this tab
    const currentAssignment = manualAssignments.find(
      (a) => a.tabId === currentTabId
    );
    const currentAssignedSequence = currentAssignment?.assignedSequence;

    // Create a set of sequences that are already assigned to OTHER tabs
    const sequencesTakenByOthers = new Set(
      manualAssignments
        .filter(
          (a) =>
            a.tabId !== currentTabId &&
            a.assignedSequence !== null &&
            a.assignedSequence !== undefined
        )
        .map((a) => a.assignedSequence)
    );

    // Also include sequences from the assignedSequences set that are from user changes
    assignedSequences.forEach((seq) => {
      if (seq !== currentAssignedSequence) {
        sequencesTakenByOthers.add(seq);
      }
    });

    const options = Array.from({ length: maxSeq }, (_, i) => {
      const seq = i + 1;

      // Sequence is taken if it's assigned to another tab AND it's not the current tab's current assignment
      const isTaken =
        sequencesTakenByOthers.has(seq) && seq !== currentAssignedSequence;

      return {
        value: seq,
        label: seq.toString(),
        disabled: false, // Always enable all options
        taken: isTaken, // Mark if taken for styling
      };
    });

    return options;
  };

  const handleSequenceChange = (tabId, newSequence) => {
    const seq = parseInt(newSequence, 10);
    const oldSequence = localSequences[tabId];
    // Check if this sequence is already assigned to another tab
    const isSequenceTaken = manualAssignments.some(
      (a) => a.tabId !== tabId && a.assignedSequence === seq
    );

    if (isSequenceTaken) {
      setLocalSequences((prev) => {
        const updated = { ...prev, [tabId]: null };
        return updated;
      });

      setManualAssignments((prev) => {
        const updated = prev.map((a) =>
          a.tabId === tabId ? { ...a, assignedSequence: null } : a
        );
        return updated;
      });

      // Remove from assigned sequences if it was there
      setAssignedSequences((prev) => {
        const newSet = new Set(prev);

        if (oldSequence) {
          newSet.delete(oldSequence);
        }

        return newSet;
      });
    } else {
      // Update local sequences
      setLocalSequences((prev) => {
        const updated = { ...prev, [tabId]: seq };
        return updated;
      });

      // Update manual assignments
      setManualAssignments((prev) => {
        const updated = prev.map((a) =>
          a.tabId === tabId ? { ...a, assignedSequence: seq } : a
        );

        return updated;
      });

      // Update assigned sequences set - only track user-assigned sequences
      setAssignedSequences((prev) => {
        const newSet = new Set(prev);

        if (oldSequence && oldSequence !== seq) {
          newSet.delete(oldSequence);
        }

        // Add the new sequence (only if it's different from the original)
        const originalAssignment = manualAssignments.find(
          (a) => a.tabId === tabId
        )?.currentSequence;

        if (seq && seq !== originalAssignment) {
          newSet.add(seq);
        }

        return newSet;
      });
    }

    setHasUserMadeChanges(true);
  };

  const handleSwapSelectionChange = (field, tabId) => {
    setSwapSelections((prev) => ({
      ...prev,
      [field]: tabId,
    }));
  };

  const handleSwap = () => {
    if (
      swapSelections.firstTab &&
      swapSelections.secondTab &&
      swapSelections.firstTab !== swapSelections.secondTab
    ) {
      const t1 = swapSelections.firstTab;
      const t2 = swapSelections.secondTab;
      const s1 = localSequences[t1];
      const s2 = localSequences[t2];

      // Update local sequences
      setLocalSequences((prev) => ({
        ...prev,
        [t1]: s2,
        [t2]: s1,
      }));

      // Update manual assignments
      setManualAssignments((prev) =>
        prev.map((a) => {
          if (a.tabId === t1) return { ...a, assignedSequence: s2 };
          if (a.tabId === t2) return { ...a, assignedSequence: s1 };
          return a;
        })
      );

      // Update assigned sequences for swap
      setAssignedSequences((prev) => {
        const newSet = new Set(prev);

        // For swap, we need to check if these sequences were user-assigned
        const t1Original = manualAssignments.find(
          (a) => a.tabId === t1
        )?.currentSequence;
        const t2Original = manualAssignments.find(
          (a) => a.tabId === t2
        )?.currentSequence;

        // Remove old assignments if they were user-assigned
        if (s1 !== t1Original) newSet.delete(s1);
        if (s2 !== t2Original) newSet.delete(s2);

        // Add new assignments if they differ from original
        if (s2 !== t1Original) newSet.add(s2);
        if (s1 !== t2Original) newSet.add(s1);

        return newSet;
      });

      setSwapSelections({ firstTab: null, secondTab: null });
      setHasUserMadeChanges(true);
      onSwap([t1, t2]);
    }
  };

  const handleSave = () => {
    const updates = Object.entries(localSequences).map(
      ([tabId, virtualSequence]) => ({
        tabId,
        virtualSequence,
      })
    );
    onSave(updates);
  };

  const handleReset = () => {
    onReset();
    onClose();
  };

  const swapTabOptions =
    siblings?.map((s) => ({
      value: s.tabId,
      label: s.name,
      disabled: false,
    })) || [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">
            Edit Sequences for {tab?.name}'s Group
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ×
          </button>
        </div>

        {/* Swap Section */}
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <Edit size={20} className="text-yellow-600" />
            <h4 className="font-medium text-yellow-800">Swap Sequences</h4>
          </div>
          <p className="text-sm text-yellow-700 mb-3">
            Select two different tabs to swap their sequences
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Tab
              </label>
              <CustomDropdown
                value={swapSelections.firstTab}
                onChange={(value) =>
                  handleSwapSelectionChange("firstTab", value)
                }
                options={swapTabOptions}
                placeholder="Select first tab"
                disabled={false}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Second Tab
              </label>
              <CustomDropdown
                value={swapSelections.secondTab}
                onChange={(value) =>
                  handleSwapSelectionChange("secondTab", value)
                }
                options={swapTabOptions}
                placeholder="Select second tab"
                disabled={false}
              />
            </div>
          </div>

          {(swapSelections.firstTab || swapSelections.secondTab) && (
            <div className="mb-3 p-3 bg-white border border-gray-200 rounded">
              <h5 className="text-sm font-medium text-gray-700 mb-2">
                Selected for Swap:
              </h5>
              <div className="flex gap-4 text-sm">
                {swapSelections.firstTab && (
                  <div>
                    <span className="font-medium">First:</span>{" "}
                    {
                      siblings?.find((s) => s.tabId === swapSelections.firstTab)
                        ?.name
                    }
                    <span className="ml-2 text-gray-500">
                      (Current: {localSequences[swapSelections.firstTab]})
                    </span>
                  </div>
                )}
                {swapSelections.secondTab && (
                  <div>
                    <span className="font-medium">Second:</span>{" "}
                    {
                      siblings?.find(
                        (s) => s.tabId === swapSelections.secondTab
                      )?.name
                    }
                    <span className="ml-2 text-gray-500">
                      (Current: {localSequences[swapSelections.secondTab]})
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <button
            onClick={handleSwap}
            disabled={
              !swapSelections.firstTab ||
              !swapSelections.secondTab ||
              swapSelections.firstTab === swapSelections.secondTab
            }
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Edit size={16} />
            Swap Selected Tabs
          </button>
        </div>

        {/* Manual Sequence Assignment */}
        <div className="mb-6">
          <h4 className="font-medium mb-3">Manual Sequence Assignment</h4>

          {/* Debug Info - You can remove this in production */}
          <div className="mb-2 p-2 bg-gray-100 rounded text-xs">
            <strong>User-Assigned Sequences:</strong>{" "}
            {Array.from(assignedSequences)
              .sort((a, b) => a - b)
              .join(", ") || "None"}
            {hasUserMadeChanges && (
              <span className="ml-2 text-green-600">• Changes made</span>
            )}
          </div>

          <div className="mb-4 bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tab Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Current Sequence
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assigned Sequence
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Select New Sequence
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {manualAssignments.map((assignment) => {
                  const rowOptions = getOptionsForRow(assignment.tabId);
                  const isUserModified =
                    assignment.assignedSequence !== assignment.currentSequence;

                  return (
                    <tr key={assignment.tabId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {assignment.name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {assignment.currentSequence}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            !isUserModified
                              ? "bg-gray-100 text-gray-800"
                              : assignment.assignedSequence === null
                              ? "bg-red-100 text-red-800"
                              : "bg-green-100 text-green-800"
                          }`}
                        >
                          {assignment.assignedSequence === null
                            ? "Not set"
                            : assignment.assignedSequence}
                          {isUserModified &&
                            assignment.assignedSequence !== null && (
                              <span className="ml-1">✓</span>
                            )}
                          {assignment.assignedSequence === null && (
                            <span className="ml-1">⚠️</span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        <CustomDropdown
                          value={assignment.assignedSequence}
                          onChange={(value) =>
                            handleSequenceChange(assignment.tabId, value)
                          }
                          options={rowOptions}
                          placeholder="Select sequence"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded"></div>
                <span className="text-gray-600">Current Sequence</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-100 border border-green-300 rounded"></div>
                <span className="text-gray-600">Modified Sequence</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-gray-100 border border-gray-300 rounded"></div>
                <span className="text-gray-600">Unchanged Sequence</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-red-100 border border-red-300 rounded"></div>
                <span className="text-gray-600">Taken Sequence (Not Set)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between gap-3">
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 flex items-center gap-2"
          >
            <RotateCcw size={16} />
            Reset to Default
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasUserMadeChanges}
              className={`px-4 py-2 rounded hover:bg-green-700 flex items-center gap-2 ${
                hasUserMadeChanges
                  ? "bg-green-600 text-white cursor-pointer"
                  : "bg-gray-400 text-white opacity-50 cursor-not-allowed"
              }`}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const HTabsManipulation = () => {
  const [loading, setLoading] = useState(false);
  const [sequenceLoading, setSequenceLoading] = useState(false);
  const [reportTypes] = useState(["Hide/Show Tabs", "Sequence Number"]);
  const [selectedReportType, setSelectedReportType] =
    useState("Hide/Show Tabs");
  const [expandedTabs, setExpandedTabs] = useState({});
  const [tabHierarchy, setTabHierarchy] = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [editModal, setEditModal] = useState({ isOpen: false, tab: null });

  // Find any tab with the target sequence in the same parent group
  const findTabWithSequence = (
    tabsArray,
    targetSequence,
    currentParentId = null
  ) => {
    for (const tab of tabsArray) {
      const tabParentId = tab.parentTabId || "root";
      if (
        tab.virtualSequence === parseInt(targetSequence) &&
        tab.tabId &&
        tabParentId === currentParentId
      ) {
        return tab;
      }
      if (tab.children && tab.children.length > 0) {
        const found = findTabWithSequence(
          tab.children,
          targetSequence,
          currentParentId
        );
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
        const parentCheckboxState =
          calculateParentCheckboxState(updatedChildren);
        const hasAnyVisibleChild = updatedChildren.some(
          (child) => child.isVisible === true
        );
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
      } else {
        const sequenceResponse = await axios.get(
          `${backendUrl}/api/h-tabs/virtual-sequences`
        );
        if (
          sequenceResponse.data?.success &&
          sequenceResponse.data?.data?.groups
        ) {
          const sequenceHierarchy = buildHierarchyFromSequenceData(
            sequenceResponse.data
          );
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
          const childSiblings = findSiblings(
            currentTab.children,
            targetParentId
          );
          siblings = siblings.concat(childSiblings);
        }
      }
      return siblings;
    };
    return findSiblings(tabsArray, parentId);
  };

  // Handle sequence updates from modal
  const handleSequenceUpdates = async (updates) => {
    try {
      setSequenceLoading(true);
      const updateResponse = await axios.put(
        `${backendUrl}/api/h-tabs/virtual-sequence`,
        {
          updates: updates,
        }
      );
      if (updateResponse.data.success) {
        showToast("success", "Sequences updated successfully");
        await fetchTabHierarchy();
        setEditModal({ isOpen: false, tab: null });
      } else {
        showToast(
          "error",
          updateResponse.data.message || "Failed to update sequences"
        );
      }
    } catch (error) {
      console.error("Error updating sequences:", error);
      const errorMessage =
        error.response?.data?.message || "Failed to update sequences";
      showToast("error", errorMessage);
    } finally {
      setSequenceLoading(false);
    }
  };

  // Handle swap from modal
  const handleSwap = async (tabIds) => {
    if (tabIds.length === 2) {
      try {
        setSequenceLoading(true);
        const swapResponse = await axios.post(
          `${backendUrl}/api/h-tabs/swap-sequences`,
          {
            tabId1: tabIds[0],
            tabId2: tabIds[1],
          }
        );
        if (swapResponse.data.success) {
          showToast("success", "Sequences swapped successfully");
          await fetchTabHierarchy();
        } else {
          showToast(
            "error",
            swapResponse.data.message || "Failed to swap sequences"
          );
        }
      } catch (error) {
        console.error("Error swapping sequences:", error);
        const errorMessage =
          error.response?.data?.message || "Failed to swap sequences";
        showToast("error", errorMessage);
      } finally {
        setSequenceLoading(false);
      }
    }
  };

  // Handle reset to default for sequences
  const handleResetSequences = async () => {
    try {
      setSequenceLoading(true);
      await axios.post(`${backendUrl}/api/h-tabs/reset-sequences`);
      showToast("success", "Sequences reset to default");
      await fetchTabHierarchy();
    } catch (error) {
      showToast("error", "Failed to reset sequences");
    } finally {
      setSequenceLoading(false);
    }
  };

  // Open edit modal
  const openEditModal = (tab) => {
    setEditModal({ isOpen: true, tab });
  };

  // Close edit modal
  const closeEditModal = () => {
    setEditModal({ isOpen: false, tab: null });
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
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">
                  Current Sequence
                </div>
                <div className="px-3 py-1 rounded text-sm font-medium bg-blue-100 text-blue-800">
                  {tab.virtualSequence || "Not Set"}
                </div>
              </div>
              <Edit
                size={20}
                className="cursor-pointer text-indigo-600 hover:text-indigo-800 mt-5"
                title="Edit sequences for this group"
                onClick={() => openEditModal(tab)}
              />
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

  // Enhanced reset to default - resets both visibility and sequences
  const handleResetToDefault = async () => {
    if (
      confirm(
        "Are you sure you want to reset ALL tabs to default visibility and sequences?"
      )
    ) {
      try {
        setLoading(true);
        await axios.post(`${backendUrl}/api/h-tabs/reset-visibility`);
        await axios.post(`${backendUrl}/api/h-tabs/reset-sequences`);
        showToast("success", "All tabs reset to default values");
        await fetchTabHierarchy();
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

  // Get siblings and available sequences for modal
  const modalSiblings = editModal.tab
    ? getSiblingsForTab(editModal.tab, tabHierarchy)
    : [];

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
            <RotateCcw size={16} />
            Reset All to Default
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
              <span>Click edit icon to open sequence management modal</span>
            </div>
            <div className="flex items-center gap-2 text-blue-800 mt-1">
              <span className="font-medium">Modal Features:</span>
              <span>
                Swap sequences between tabs or manually assign sequences
              </span>
            </div>
            <div className="flex items-center gap-2 text-green-800 mt-1">
              <span className="font-medium">Parent Restrictions:</span>
              <span>
                Root tabs can only swap with root tabs, children with children
              </span>
            </div>
            <div className="flex items-center gap-2 text-indigo-800 mt-1">
              <span className="font-medium">Reset Options:</span>
              <span>Reset individual groups or all sequences to default</span>
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
              : "Manage tab sequences in hierarchical view. Click the edit icon to open sequence management modal."}
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

      <EditSequenceModal
        isOpen={editModal.isOpen}
        onClose={closeEditModal}
        tab={editModal.tab}
        siblings={modalSiblings}
        onSave={handleSequenceUpdates}
        onSwap={handleSwap}
        onReset={handleResetSequences}
      />
    </div>
  );
};

export default HTabsManipulation;
