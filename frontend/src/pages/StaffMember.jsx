import React, { useState, useEffect } from "react";
import { Eye, Edit, Trash2, UserPlus, Upload, X } from "lucide-react";

const staffData = [
  { id: 1, name: "Alice Johnson", email: "alice.johnson@example.com", createdAt: "2025-01-10", status: "Enabled" },
  { id: 2, name: "Bob Smith", email: "bob.smith@example.com", createdAt: "2025-01-12", status: "Disabled" },
  { id: 3, name: "Carol Lee", email: "carol.lee@example.com", createdAt: "2025-01-14", status: "Enabled" },
  { id: 4, name: "David Kim", email: "david.kim@example.com", createdAt: "2025-01-18", status: "Disabled" },
  { id: 5, name: "Eva Green", email: "eva.green@example.com", createdAt: "2025-01-20", status: "Enabled" },
  { id: 6, name: "Franklin Pierce", email: "franklin.pierce@example.com", createdAt: "2025-01-22", status: "Enabled" },
  { id: 7, name: "Grace Hopper", email: "grace.hopper@example.com", createdAt: "2025-01-25", status: "Disabled" },
  { id: 8, name: "Hannah Taylor", email: "hannah.taylor@example.com", createdAt: "2025-01-27", status: "Enabled" },
  { id: 9, name: "Ian Wright", email: "ian.wright@example.com", createdAt: "2025-01-28", status: "Disabled" },
  { id: 10, name: "Jessica Chen", email: "jessica.chen@example.com", createdAt: "2025-01-30", status: "Enabled" },
  { id: 11, name: "Kevin Lee", email: "kevin.lee@example.com", createdAt: "2025-02-01", status: "Enabled" },
  { id: 12, name: "Laura Davis", email: "laura.davis@example.com", createdAt: "2025-02-03", status: "Disabled" },
  { id: 13, name: "Michael Brown", email: "michael.brown@example.com", createdAt: "2025-02-05", status: "Enabled" },
  { id: 14, name: "Nina Patel", email: "nina.patel@example.com", createdAt: "2025-02-07", status: "Disabled" },
  { id: 15, name: "Oscar Rivera", email: "oscar.rivera@example.com", createdAt: "2025-02-10", status: "Enabled" },
];


const StaffMember = () => {
  const [staff, setStaff] = useState(staffData);
  const [selected, setSelected] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const staffPerPage = 8;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedTab]);

  // Filter staff based on tab and search
  const filteredStaff = staff.filter((s) => {
    const matchesTab =
      selectedTab === "All" ||
      (selectedTab === "Enabled" && s.status === "Enabled") ||
      (selectedTab === "Disabled" && s.status === "Disabled");

    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesTab && matchesSearch;
  });

  // Pagination logic
  const indexOfLastStaff = currentPage * staffPerPage;
  const indexOfFirstStaff = indexOfLastStaff - staffPerPage;
  const currentStaff = filteredStaff.slice(indexOfFirstStaff, indexOfLastStaff);
  const totalPages = Math.ceil(filteredStaff.length / staffPerPage);

  // Toggle select checkbox
  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  // Select all on page
  const toggleSelectAll = (checked) => {
    if (checked) {
      const idsOnPage = currentStaff.map((s) => s.id);
      setSelected((prev) => Array.from(new Set([...prev, ...idsOnPage])));
    } else {
      const idsOnPage = currentStaff.map((s) => s.id);
      setSelected((prev) => prev.filter((id) => !idsOnPage.includes(id)));
    }
  };

  // Delete selected staff
  const handleDeleteSelected = () => {
    setStaff((prev) => prev.filter((s) => !selected.includes(s.id)));
    setSelected([]);
  };

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="mb-4 text-gray-600 text-sm">
        Dashboard <span className="mx-2">{">"}</span> 
        Staff Members
      </div>

      {/* Top Bar */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-3">
          <button
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md"
            // You can add navigation here
          >
            <UserPlus size={18} /> Add New Staff Member
          </button>

          <button
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md"
            // You can open import modal here
          >
            <Upload size={18} /> Import Staff Members
          </button>

          {selected.length > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md"
            >
              <Trash2 size={18} /> Delete
            </button>
          )}
        </div>

        <input
          type="text"
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="border px-3 py-2 rounded-lg shadow-sm"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-4">
        {["All", "Enabled", "Disabled"].map((tab) => (
          <button
            key={tab}
            onClick={() => setSelectedTab(tab)}
            className={`px-4 py-2 rounded-lg ${
              selectedTab === tab
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="p-3">
                <input
                  type="checkbox"
                  checked={
                    currentStaff.length > 0 &&
                    currentStaff.every((s) => selected.includes(s.id))
                  }
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                />
              </th>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Email</th>
              <th className="p-3 text-left">Created At</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentStaff.map((staff) => (
              <tr key={staff.id} className="border-b hover:bg-gray-50">
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    checked={selected.includes(staff.id)}
                    onChange={() => toggleSelect(staff.id)}
                  />
                </td>
                <td className="p-3">{staff.name}</td>
                <td className="p-3">{staff.email}</td>
                <td className="p-3">{staff.createdAt}</td>
                <td className="p-3">{staff.status}</td>
                <td className="p-3 flex items-center justify-center gap-3">
                  <button className="text-blue-600 hover:text-blue-800" title="View">
                    <Eye size={18} />
                  </button>
                  <button className="text-green-600 hover:text-green-800" title="Edit">
                    <Edit size={18} />
                  </button>
                  <button className="text-red-600 hover:text-red-800" title="Delete">
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
            {currentStaff.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center p-6 text-gray-500">
                  No staff found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Prev
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={`px-3 py-1 rounded ${
                currentPage === page
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              {page}
            </button>
          ))}

          <button
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default StaffMember;
