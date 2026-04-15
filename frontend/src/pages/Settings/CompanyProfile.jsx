import React, { useState, useEffect, useRef } from "react";
import {
  Eye,
  Edit,
  Trash2,
  UserPlus,
  Download,
  X,
  FileText,
  Menu,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import * as XLSX from "xlsx";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import { formatDateToReadable } from "../../utils/dateUtil";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const companiesPerPage = 7;

const CompanyProfile = () => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [form, setForm] = useState({
    companyCode: "",
    companyName: "",
    registrationNumber: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    taxNumber: "",
    establishedDate: "",
    description: "",
    _id: null,
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Mobile detection and sidebar state
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/company-profile`);
      if (!response.ok) throw new Error("Failed to fetch companies");
      const data = await response.json();
      setCompanies(data.companies || []);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const filteredCompanies = companies.filter(
    (company) =>
      company.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      company.registrationNumber
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      company.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      company.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      company.email?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const hasCompanyProfile = companies.length > 0;

  // Pagination calculations
  const totalPages = Math.ceil(filteredCompanies.length / companiesPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const currentCompanies = filteredCompanies.slice(
    (currentPage - 1) * companiesPerPage,
    currentPage * companiesPerPage,
  );

  // Check if pagination is needed
  const showPagination = filteredCompanies.length > companiesPerPage;

  function getVisiblePages(currentPage, totalPages) {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 3) {
      return [1, 2, 3, "...", totalPages];
    }
    if (currentPage >= totalPages - 2) {
      return [1, "...", totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, "...", currentPage, "...", totalPages];
  }

  // Download PDF Function
  const downloadPDF = () => {
    if (filteredCompanies.length === 0) {
      showToast("warning", "No data to download");
      return;
    }

    try {
      const doc = new jsPDF("p", "mm", "a4");

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(
        "HEALTHCARE SOUTH EAST ASIA",
        doc.internal.pageSize.width / 2,
        15,
        {
          align: "center",
        },
      );

      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      doc.text("Company Profiles", doc.internal.pageSize.width / 2, 25, {
        align: "center",
      });

      const headers = [
        "Sr No.",
        "Company Name",
        "Registration No",
        "Phone",
        "Email",
        "Established Date",
      ];

      const data = filteredCompanies.map((company, index) => [
        (index + 1).toString(),
        company.companyName || "-",
        company.registrationNumber || "-",
        company.phone || "-",
        company.email || "-",
        company.establishedDate
          ? formatDateToReadable(company.establishedDate)
          : "-",
      ]);

      autoTable(doc, {
        head: [headers],
        body: data,
        startY: 35,
        styles: {
          fontSize: 8,
          cellPadding: 2,
          halign: "center",
          valign: "middle",
        },
        headStyles: {
          fillColor: [66, 114, 196],
          textColor: 255,
          fontStyle: "bold",
          halign: "center",
        },
        alternateRowStyles: {
          fillColor: [242, 242, 242],
        },
        columnStyles: {
          0: { cellWidth: 15, halign: "center" },
          1: { cellWidth: 40, halign: "center" },
          2: { cellWidth: 30, halign: "center" },
          3: { cellWidth: 25, halign: "center" },
          4: { cellWidth: 40, halign: "center" },
          5: { cellWidth: 25, halign: "center" },
        },
        tableWidth: "wrap",
        margin: { top: 35, left: (doc.internal.pageSize.width - 175) / 2 },
      });

      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 10, {
          align: "center",
        });
        doc.text(
          `Generated on: ${new Date().toLocaleDateString()}`,
          pageWidth - 20,
          pageHeight - 10,
          { align: "right" },
        );
      }

      doc.save(
        `companies_profile_${new Date().toISOString().split("T")[0]}.pdf`,
      );

      showToast("success", "PDF downloaded successfully");
    } catch (error) {
      console.error("Error generating PDF:", error);
      showToast("error", "Failed to generate PDF");
    }
  };

  const downloadCompanyDetailPDF = (company) => {
    try {
      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.width;

      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("COMPANY PROFILE DETAILS", pageWidth / 2, 20, {
        align: "center",
      });

      let yPosition = 40;

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Basic Information", pageWidth / 2, yPosition, {
        align: "center",
      });
      yPosition += 10;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const companyDetails = [
        { label: "Company Code", value: company.companyCode || "-" },
        { label: "Company Name", value: company.companyName || "-" },
        {
          label: "Registration Number",
          value: company.registrationNumber || "-",
        },
        { label: "Tax Number", value: company.taxNumber || "-" },
        {
          label: "Established Date",
          value: company.establishedDate
            ? formatDateToReadable(company.establishedDate)
            : "-",
        },
      ];

      companyDetails.forEach((detail) => {
        const line = `${detail.label}: ${detail.value}`;
        doc.text(line, pageWidth / 2, yPosition, { align: "center" });
        yPosition += 7;
      });

      yPosition += 10;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Contact Information", pageWidth / 2, yPosition, {
        align: "center",
      });
      yPosition += 10;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);

      const contactDetails = [
        { label: "Address", value: company.address || "-" },
        { label: "Phone", value: company.phone || "-" },
        { label: "Email", value: company.email || "-" },
        { label: "Website", value: company.website || "-" },
      ];

      contactDetails.forEach((detail) => {
        const line = `${detail.label}: ${detail.value}`;
        const wrapped = doc.splitTextToSize(line, pageWidth - 40);
        doc.text(wrapped, pageWidth / 2, yPosition, { align: "center" });
        yPosition += wrapped.length * 6;
      });

      yPosition += 10;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Description", pageWidth / 2, yPosition, { align: "center" });
      yPosition += 10;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const desc =
        company.description || "No description provided by the company.";
      const descLines = doc.splitTextToSize(desc, pageWidth - 40);
      doc.text(descLines, pageWidth / 2, yPosition, { align: "center" });

      const pageHeight = doc.internal.pageSize.height;
      doc.setFontSize(8);
      doc.text(
        `Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: "center" },
      );

      doc.save(`${company.companyName || "company"}_profile.pdf`);
      showToast("success", "Company details PDF downloaded");
    } catch (error) {
      console.error("Error generating company PDF:", error);
      showToast("error", "Failed to generate company PDF");
    }
  };

  const downloadExcel = async () => {
    if (filteredCompanies.length === 0) {
      showToast("warning", "No data to download");
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Company Profile");
      worksheet.mergeCells("A1:J1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
      titleCell.font = { bold: true, size: 16 };
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      worksheet.getRow(1).height = 30;

      const headerRow = worksheet.getRow(2);
      const headers = [
        "Company Code",
        "Company Name",
        "Registration Number",
        "Address",
        "Phone",
        "Email",
        "Website",
        "Tax Number",
        "Established Date",
        "Description",
      ];
      headerRow.values = headers;
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.alignment = { horizontal: "center", vertical: "middle" };
      headerRow.height = 22;
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "4472C4" },
        };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      const colWidths = [15, 25, 20, 30, 15, 25, 20, 15, 18, 40];
      colWidths.forEach((w, i) => {
        worksheet.getColumn(i + 1).width = w;
      });

      filteredCompanies.forEach((company) => {
        worksheet.addRow([
          company.companyCode || "",
          company.companyName || "",
          company.registrationNumber || "",
          company.address || "",
          company.phone || "",
          company.email || "",
          company.website || "",
          company.taxNumber || "",
          company.establishedDate
            ? formatDateToReadable(company.establishedDate)
            : "",
          company.description || "",
        ]);
      });

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= 2) return;

        row.height = 20;
        row.alignment = { horizontal: "center", vertical: "middle" };

        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });

        if ((rowNumber - 2) % 2 === 1) {
          row.eachCell((cell) => {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "F2F2F2" },
            };
          });
        }
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "companiesProfile.xlsx";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);

      showToast("success", `Downloaded companies profile successfully`);
    } catch (error) {
      console.error("Error downloading Excel:", error);
      showToast("error", "Failed to generate Excel file");
    }
  };

  const editCompany = (company) => {
    setForm({
      ...company,
      establishedDate: company.establishedDate || "",
    });
    setIsEditModalOpen(true);
  };

  const handleView = (company) => {
    setForm({
      ...company,
      establishedDate: company.establishedDate || "",
    });
    setIsViewModalOpen(true);
  };

  const openAddModal = () => {
    setForm({
      companyCode: "",
      companyName: "",
      registrationNumber: "",
      address: "",
      phone: "",
      email: "",
      website: "",
      taxNumber: "",
      establishedDate: "",
      description: "",
      _id: null,
    });
    setIsAddModalOpen(true);
  };

  const deleteCompany = async (company) => {
    if (!company._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete <b>${company.companyName}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/company-profile/${company._id}`,
        );

        if (res.status === 200) {
          showToast(
            "success",
            `Company <b>${company.companyName}</b> deleted successfully`,
          );
          fetchCompanies();
        }
      } catch (error) {
        showToast("error", "Failed to delete company.");
      }
    }
  };

  const handleUpdateCompany = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.put(
        `${backendUrl}/api/company-profile/${form._id}`,
        form,
      );
      if (res.status === 200) {
        showToast(
          "success",
          `Company <b>${form.companyName}</b> updated successfully`,
        );
        setIsEditModalOpen(false);
        fetchCompanies();
      }
    } catch (err) {
      showToast("error", "Failed to update company.");
    }
  };

  const handleCreateCompany = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${backendUrl}/api/company-profile`, form);
      if (res.status === 201) {
        showToast(
          "success",
          `Company <b>${form.companyName}</b> created successfully`,
        );
        setIsAddModalOpen(false);
        fetchCompanies();
      }
    } catch (err) {
      showToast("error", "Failed to create company.");
    }
  };

  // Mobile card view component (without edit and delete buttons)
  const MobileCompanyCard = ({ company, index }) => (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4 mb-3">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-800 text-lg">
            {company.companyName}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Reg No: {company.registrationNumber || "-"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleView(company)}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="View"
          >
            <Eye size={18} />
          </button>
          <button
            onClick={() => downloadCompanyDetailPDF(company)}
            className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
            title="Download PDF"
          >
            <FileText size={18} />
          </button>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex">
          <span className="text-gray-600 w-28">Address:</span>
          <span className="text-gray-800 flex-1 capitalize">
            {company.address || "-"}
          </span>
        </div>
        <div className="flex">
          <span className="text-gray-600 w-28">Phone:</span>
          <span className="text-gray-800 flex-1">{company.phone || "-"}</span>
        </div>
        <div className="flex">
          <span className="text-gray-600 w-28">Email:</span>
          <span className="text-gray-800 flex-1 truncate">
            {company.email || "-"}
          </span>
        </div>
        <div className="flex">
          <span className="text-gray-600 w-28">Established:</span>
          <span className="text-gray-800 flex-1">
            {formatDateToReadable(company.establishedDate)}
          </span>
        </div>
      </div>
    </div>
  );

  if (loading) return <div className="p-6 text-center">Loading...</div>;
  if (error) return <div className="p-6 text-red-500 text-center">{error}</div>;

  return (
    <div className={`${isMobileView ? "px-3 pb-20" : "p-6"} relative`}>
      {/* Sidebar for mobile */}
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}

      {/* Mobile Header with Hamburger Menu */}
      {isMobileView && (
        <div className="flex justify-between items-center mb-4 bg-gray-200 p-2 border-gray-200 rounded-2xl">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <h1 className="text-base font-bold text-gray-800">
              Company Profiles
            </h1>
          </div>
          {hasCompanyProfile && (
            <button
              onClick={downloadPDF}
              className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg shadow-md cursor-pointer transition-colors text-sm"
            >
              <FileText size={16} /> PDF
            </button>
          )}
        </div>
      )}

      {/* Desktop Header */}
      {!isMobileView && (
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-3">
            {hasCompanyProfile && (
              <>
                <button
                  onClick={downloadPDF}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer transition-colors"
                >
                  <FileText size={18} /> Download PDF
                </button>
                <button
                  onClick={downloadExcel}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer transition-colors"
                >
                  <Download size={18} /> Download Excel
                </button>
                <button
                  onClick={openAddModal}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer transition-colors"
                >
                  <UserPlus size={18} /> Add Company
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {hasCompanyProfile ? (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto shadow rounded-2xl border border-gray-200">
            <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
              <thead className="bg-gray-100 text-gray-700 border-b">
                <tr>
                  <th className="p-3 text-sm font-medium">Sr No.</th>
                  <th className="p-3 text-sm font-medium">Company Name</th>
                  <th className="p-3 text-sm font-medium">
                    Registration Number
                  </th>
                  <th className="p-3 text-sm font-medium">Address</th>
                  <th className="p-3 text-sm font-medium">Phone</th>
                  <th className="p-3 text-sm font-medium">Email</th>
                  <th className="p-3 text-sm font-medium">Established Date</th>
                  <th className="p-3 text-sm font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {currentCompanies.length > 0 ? (
                  currentCompanies.map((company, index) => (
                    <tr
                      key={company._id}
                      className={`hover:bg-gray-50 ${
                        (index + 1) % companiesPerPage === 0 ||
                        index + 1 === currentCompanies.length
                          ? ""
                          : "border-b"
                      }`}
                    >
                      <td className="p-3">
                        {(currentPage - 1) * companiesPerPage + index + 1}
                      </td>
                      <td className="p-3">{company.companyName}</td>
                      <td className="p-3">{company.registrationNumber}</td>
                      <td className="p-3 capitalize">{company.address}</td>
                      <td className="p-3">{company.phone}</td>
                      <td className="p-3">{company.email}</td>
                      <td className="p-3">
                        {formatDateToReadable(company.establishedDate)}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleView(company)}
                            className="text-blue-600 hover:text-blue-800 cursor-pointer transition-colors p-1"
                            title="View"
                          >
                            <Eye size={18} />
                          </button>
                          <button
                            onClick={() => editCompany(company)}
                            className="text-green-600 hover:text-green-800 cursor-pointer transition-colors p-1"
                            title="Edit"
                          >
                            <Edit size={18} />
                          </button>
                          <button
                            onClick={() => downloadCompanyDetailPDF(company)}
                            className="text-purple-600 hover:text-purple-800 cursor-pointer transition-colors p-1"
                            title="Download PDF"
                          >
                            <FileText size={18} />
                          </button>
                          <button
                            onClick={() => deleteCompany(company)}
                            className="text-red-600 hover:text-red-800 cursor-pointer transition-colors p-1"
                            title="Delete"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-gray-500">
                      No company records found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden">
            {currentCompanies.length > 0 ? (
              currentCompanies.map((company, index) => (
                <MobileCompanyCard
                  key={company._id}
                  company={company}
                  index={(currentPage - 1) * companiesPerPage + index + 1}
                />
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                No company records found
              </div>
            )}
          </div>

          {/* Pagination - Only show when needed */}
          {showPagination && (
            <>
              <div className="mt-4 p-3 md:p-5 flex flex-wrap justify-center md:justify-start gap-2">
                <button
                  onClick={() => {
                    setCurrentPage((prev) => Math.max(prev - 1, 1));
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 cursor-pointer transition-colors flex items-center gap-1"
                >
                  <ChevronLeft size={16} /> Prev
                </button>

                <div className="flex flex-wrap justify-center gap-1">
                  {visiblePages.map((page, idx) =>
                    page === "..." ? (
                      <span
                        key={`ellipsis-${idx}`}
                        className="px-2 md:px-3 py-1 text-gray-500 select-none"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={page}
                        onClick={() => {
                          setCurrentPage(page);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className={`min-w-[36px] md:w-10 px-2 md:px-3 py-1 rounded-lg text-center transition cursor-pointer ${
                          currentPage === page
                            ? "bg-indigo-600 text-white"
                            : "bg-gray-200 hover:bg-gray-300"
                        }`}
                      >
                        {page}
                      </button>
                    ),
                  )}
                </div>

                <button
                  onClick={() => {
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 cursor-pointer transition-colors flex items-center gap-1"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>

              {/* Page Info for Mobile */}
              <div className="md:hidden text-center text-sm text-gray-500 mt-2">
                Page {currentPage} of {totalPages}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="text-center py-12 bg-white rounded-2xl shadow border border-gray-200">
          <UserPlus size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            No Company Profile Found
          </h3>
          <p className="text-gray-500 mb-6">
            Get started by creating your company profile
          </p>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl shadow-md cursor-pointer transition-colors mx-auto"
          >
            <UserPlus size={20} /> Add Company Profile
          </button>
        </div>
      )}

      {/* Add Company Modal */}
      {isAddModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white w-full max-w-2xl p-4 md:p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-[90vh]">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer transition-colors z-10"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-4 pr-6">
                Add Company Profile
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Code *
                  </label>
                  <input
                    type="text"
                    value={form.companyCode}
                    onChange={(e) =>
                      setForm({ ...form, companyCode: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={(e) =>
                      setForm({ ...form, companyName: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Registration Number
                  </label>
                  <input
                    type="text"
                    value={form.registrationNumber}
                    onChange={(e) =>
                      setForm({ ...form, registrationNumber: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tax Number
                  </label>
                  <input
                    type="text"
                    value={form.taxNumber}
                    onChange={(e) =>
                      setForm({ ...form, taxNumber: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Website
                  </label>
                  <input
                    type="url"
                    value={form.website}
                    onChange={(e) =>
                      setForm({ ...form, website: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address
                  </label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) =>
                      setForm({ ...form, address: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                    rows="3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Established Date
                  </label>
                  <DatePicker
                    selected={
                      form.establishedDate
                        ? new Date(form.establishedDate)
                        : null
                    }
                    onChange={(date) =>
                      date
                        ? setForm({
                            ...form,
                            establishedDate: date.toISOString().split("T")[0],
                          })
                        : setForm({ ...form, establishedDate: "" })
                    }
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select a date"
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateCompany}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  Submit
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Edit Company Modal */}
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white w-full max-w-2xl p-4 md:p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-[90vh]">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer transition-colors z-10"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-4 pr-6">
                Edit Company
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Code
                  </label>
                  <input
                    type="text"
                    value={form.companyCode}
                    className="w-full border px-3 py-2 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={(e) =>
                      setForm({ ...form, companyName: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Registration Number
                  </label>
                  <input
                    type="text"
                    value={form.registrationNumber}
                    onChange={(e) =>
                      setForm({ ...form, registrationNumber: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tax Number
                  </label>
                  <input
                    type="text"
                    value={form.taxNumber}
                    onChange={(e) =>
                      setForm({ ...form, taxNumber: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Website
                  </label>
                  <input
                    type="url"
                    value={form.website}
                    onChange={(e) =>
                      setForm({ ...form, website: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address
                  </label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) =>
                      setForm({ ...form, address: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                    rows="3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Established Date
                  </label>
                  <DatePicker
                    selected={
                      form.establishedDate
                        ? new Date(form.establishedDate)
                        : null
                    }
                    onChange={(date) =>
                      date
                        ? setForm({
                            ...form,
                            establishedDate: date.toISOString().split("T")[0],
                          })
                        : setForm({ ...form, establishedDate: "" })
                    }
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select a date"
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateCompany}
                  className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  Update Company
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* View Company Modal */}
      {isViewModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white w-full max-w-2xl p-4 md:p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-[90vh]">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer transition-colors z-10"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-4 pr-6">
                View Company
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Company Code
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-50">
                    {form.companyCode}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Company Name
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-50 capitalize">
                    {form.companyName}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Registration Number
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-50">
                    {form.registrationNumber}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Tax Number
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-50">
                    {form.taxNumber}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Phone
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-50">
                    {form.phone}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Email
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-50">
                    {form.email}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Website
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-50">
                    {form.website}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Address
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-50 capitalize">
                    {form.address}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Description
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-50 min-h-[80px]">
                    {form.description || "No description provided"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Established Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-50">
                    {formatDateToReadable(form.establishedDate)}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-col md:flex-row justify-end gap-3">
                <button
                  onClick={() => downloadCompanyDetailPDF(form)}
                  className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  <FileText size={16} /> Download PDF
                </button>
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default CompanyProfile;
