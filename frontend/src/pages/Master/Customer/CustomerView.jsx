import React from "react";

const CustomerView = ({ form }) => {
  const field = (label, value) => (
    <div>
      <label className="block text-sm font-medium text-gray-600">{label}</label>
      <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">{value}</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {field("Name", form.name)}
      {field("Email", form.email)}
      {field("Phone", form.phone)}
      {field("Warehouse", form.warehouse)}
      {field("Tax Number", form.taxNumber)}
      {field("Opening Balance", form.openingBalance)}
      {field("Type", form.type)}
      {field("Credit Period", form.creditPeriod)}
      {field("Credit Limit", form.creditLimit)}
      {field("Status", form.status)}
    </div>
  );
};

export default CustomerView;
