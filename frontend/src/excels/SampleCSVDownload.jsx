import React from "react";

const SampleCSVDownload = () => {
  const headers = [
    "warehouse",
    "name",
    "phone",
    "email",
    "status",
    "password",
    "taxNumber",
    "openingBalance",
    "type",
    "creditPeriod",
    "creditLimit",
  ];

  const values = [
    "", "", "", "", "enabled", "", "", "", "", "", ""
  ];

  const csvContent =
    headers.join(",") + "\n" + values.join(",");

  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  return (
    <a
      href={url}
      download="sample.csv"
      className="text-blue-600 hover:underline text-sm mb-4 block"
    >
      Click here to download Sample CSV file
    </a>
  );
};

export default SampleCSVDownload;
