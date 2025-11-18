import React from 'react';
import ReactDOM from 'react-dom';
import { X } from "lucide-react";
import { formatCurrency } from './DashboardUtil';

const AllMRsSalaryModal = ({ 
  showModal, 
  onClose, 
  previousMonthLabel, 
  allMRsWithSalary 
}) => {
  if (!showModal) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-4xl max-h-[90vh] overflow-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold text-gray-800">
              All MRs Salary - {previousMonthLabel}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              <X size={24} />
            </button>
          </div>
        </div>
        <div className="p-6">
          <table className="w-full border-collapse text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-sm font-semibold text-gray-700">MR Name</th>
                <th className="p-3 text-sm font-semibold text-gray-700">Team</th>
                <th className="p-3 text-sm font-semibold text-gray-700">Contact No</th>
                <th className="p-3 text-sm font-semibold text-gray-700">Email</th>
                <th className="p-3 text-sm font-semibold text-gray-700">Basic Salary ($)</th>
                <th className="p-3 text-sm font-semibold text-gray-700">Allowances ($)</th>
                <th className="p-3 text-sm font-semibold text-gray-700">Deductions ($)</th>
                <th className="p-3 text-sm font-semibold text-gray-700">Net Salary ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {allMRsWithSalary.map((item) => (
                <tr key={item._id} className="hover:bg-gray-50">
                  <td className="p-3 text-sm text-gray-600 capitalize">
                    {item.employeeId?.medicalRepName}
                  </td>
                  <td className="p-3 text-sm text-gray-600">
                    {item.employeeId?.teamName}
                  </td>
                  <td className="p-3 text-sm text-gray-600">
                    {item.employeeId?.contactNo}
                  </td>
                  <td className="p-3 text-sm text-gray-600">
                    {item.employeeId?.email}
                  </td>
                  <td className="p-3 text-sm text-gray-600">
                    {item.basicSalary || 0}
                  </td>
                  <td className="p-3 text-sm text-gray-600">
                    {item.totalAllowance || 0}
                  </td>
                  <td className="p-3 text-sm text-gray-600">
                    {item.deductions || 0}
                  </td>
                  <td className="p-3 text-sm text-gray-600 font-semibold">
                    ${formatCurrency(item.netSalary || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {allMRsWithSalary.length === 0 && (
            <p className="text-center text-gray-500 py-4">No payroll data found</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AllMRsSalaryModal;