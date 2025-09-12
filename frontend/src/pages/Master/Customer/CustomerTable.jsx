// src/pages/Customer/CustomerTable.jsx
import React from "react";
import { Eye, Edit, Trash2 } from "lucide-react";
import { formatDateToReadable } from "../../utils/dateUtil";

const CustomerTable = ({
  currentCustomers,
  selected,
  toggleSelect,
  toggleSelectAll,
  handleView,
  editCustomer,
  deleteCustomer,
}) => {
  return (
    <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center">
      <thead className="bg-gray-100 text-gray-700">
        <tr>
          <th className="p-3">
            <div className="flex items-center gap-4">
              <input
                type="checkbox"
                checked={
                  selected.length === currentCustomers.length &&
                  currentCustomers.length > 0
                }
                onChange={(e) => toggleSelectAll(e.target.checked)}
              />
              <span>Name</span>
            </div>
          </th>
          <th className="p-3">Email</th>
          <th className="p-3">WareHouse</th>
          <th className="p-3">Created At</th>
          <th className="p-3">Balance</th>
          <th className="p-3">Status</th>
          <th className="p-3">Action</th>
        </tr>
      </thead>
      <tbody>
        {currentCustomers.map((customer) => (
          <tr key={customer._id} className="border-b hover:bg-gray-50">
            <td className="p-3">
              <div className="flex items-center gap-4">
                <input
                  type="checkbox"
                  checked={selected.includes(customer._id)}
                  onChange={() => toggleSelect(customer)}
                />
                <span className="capitalize">{customer.name}</span>
              </div>
            </td>
            <td className="p-3">{customer.email}</td>
            <td className="p-3 capitalize">{customer.warehouse}</td>
            <td className="p-3">{formatDateToReadable(customer.createdAt)}</td>
            <td
              className={`p-3 font-medium ${
                customer.type === "pay" ? "text-red-600" : "text-green-600"
              }`}
            >
              ₹{Math.abs(customer.openingBalance)}
            </td>
            <td className="p-3 capitalize">{customer.status}</td>
            <td className="p-3 flex items-center justify-center gap-3">
              <button className="text-blue-600 hover:text-blue-800">
                <Eye onClick={() => handleView(customer)} size={18} />
              </button>
              <button className="text-green-600 hover:text-green-800">
                <Edit onClick={() => editCustomer(customer)} size={18} />
              </button>
              <button
                onClick={() => deleteCustomer(customer)}
                className="text-red-600 hover:text-red-800"
              >
                <Trash2 size={18} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default CustomerTable;
