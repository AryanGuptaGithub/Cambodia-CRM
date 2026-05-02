

import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Filter, X, ChevronDown, ChevronUp, Search, CheckSquare, Square, Users } from "lucide-react";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// ─── Small helper: checkbox row ───────────────────────────────────────────────
const MrRow = ({ name, checked, onChange }) => (
  <label className="flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 rounded-lg cursor-pointer group transition-colors">
    <span
      className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
        checked
          ? "bg-indigo-600 border-indigo-600"
          : "border-gray-300 group-hover:border-indigo-400"
      }`}
    >
      {checked && (
        <svg viewBox="0 0 10 8" className="w-2.5 h-2 fill-white">
          <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
    <span className={`text-sm truncate ${checked ? "text-indigo-800 font-medium" : "text-gray-700"}`}>
      {name}
    </span>
  </label>
);

// ─── Main component ───────────────────────────────────────────────────────────
const MrFilterPanel = ({ selectedMrNames = [], onChange }) => {
  const [allMrs, setAllMrs] = useState([]);          // full list from API
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);           // panel open/close
  const [search, setSearch] = useState("");          // search inside panel
  const panelRef = useRef(null);

  // Fetch MR list once on mount
  useEffect(() => {
    const fetchMrs = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${backendUrl}/api/sales-salary-ratio/mrs`);
        if (res.data?.success) {
          setAllMrs(res.data.data || []);
        }
      } catch (err) {
        console.error("Failed to load MR list", err);
      } finally {
        setLoading(false);
      }
    };
    fetchMrs();
  }, []);

  // Close panel when clicking outside
  useEffect(() => {
    const handleOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const filteredMrs = allMrs.filter((mr) =>
    mr.mrName.toLowerCase().includes(search.toLowerCase()),
  );

  const isAllSelected =
    selectedMrNames.length === 0 || selectedMrNames.length === allMrs.length;

  const toggleMr = (mrName) => {
    // If currently "all selected" (empty array means all), switch to all-except-this
    if (selectedMrNames.length === 0) {
      onChange(allMrs.map((m) => m.mrName).filter((n) => n !== mrName));
      return;
    }
    const already = selectedMrNames.includes(mrName);
    const next = already
      ? selectedMrNames.filter((n) => n !== mrName)
      : [...selectedMrNames, mrName];

    // If all are now selected, reset to empty (= all)
    onChange(next.length === allMrs.length ? [] : next);
  };

  const toggleAll = () => {
    onChange([]); // empty = all selected
  };

  const clearAll = () => {
    // Deselect everything — pass a dummy unique value so no MR matches
    onChange(["__none__"]);
  };

  const selectedCount =
    selectedMrNames.length === 0
      ? allMrs.length
      : selectedMrNames.filter((n) => n !== "__none__").length;

  const isNoneSelected =
    selectedMrNames.length === 1 && selectedMrNames[0] === "__none__";

  return (
    <div className="relative" ref={panelRef}>
      {/* ── Trigger Button ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all shadow-sm ${
          isAllSelected && !isNoneSelected
            ? "border-gray-300 bg-white text-gray-700 hover:border-indigo-400 hover:text-indigo-700"
            : isNoneSelected
            ? "border-red-300 bg-red-50 text-red-700"
            : "border-indigo-500 bg-indigo-50 text-indigo-800"
        }`}
      >
        <Filter size={15} />
        <span>
          {isNoneSelected
            ? "No MRs selected"
            : isAllSelected
            ? "All MRs"
            : `${selectedCount} MR${selectedCount !== 1 ? "s" : ""} selected`}
        </span>
        {!isAllSelected && !isNoneSelected && (
          <span className="bg-indigo-600 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
            {selectedCount}
          </span>
        )}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* ── Dropdown Panel ── */}
      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 w-72 bg-white border border-gray-200 rounded-xl shadow-xl flex flex-col max-h-[420px]">
          {/* Header */}
          <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Users size={14} className="text-indigo-600" />
              MR Filter
              {loading && (
                <span className="ml-1 w-3 h-3 border border-indigo-500 border-t-transparent rounded-full animate-spin inline-block" />
              )}
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 p-0.5 rounded">
              <X size={14} />
            </button>
          </div>

          {/* Search box */}
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5">
              <Search size={13} className="text-gray-400 flex-shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search MR name..."
                className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Select All / Clear All */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
            <button
              onClick={toggleAll}
              className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              <CheckSquare size={13} />
              Select All
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={clearAll}
              className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
            >
              <Square size={13} />
              Deselect All
            </button>
            <span className="ml-auto text-xs text-gray-400">
              {selectedCount}/{allMrs.length}
            </span>
          </div>

          {/* MR list */}
          <div className="flex-1 overflow-y-auto py-1">
            {loading ? (
              <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>
            ) : filteredMrs.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No MRs found</div>
            ) : (
              filteredMrs.map((mr) => {
                const isChecked =
                  !isNoneSelected &&
                  (selectedMrNames.length === 0 ||
                    selectedMrNames.includes(mr.mrName));
                return (
                  <MrRow
                    key={mr.mrId ?? mr.mrName}
                    name={mr.mrName}
                    checked={isChecked}
                    onChange={() => toggleMr(mr.mrName)}
                  />
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {isNoneSelected
                ? "No MRs — report will be empty"
                : isAllSelected
                ? "Showing all MRs"
                : `Showing ${selectedCount} of ${allMrs.length} MRs`}
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MrFilterPanel;


