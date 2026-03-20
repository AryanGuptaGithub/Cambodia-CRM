import express from "express";
import ExcelJS from "exceljs";
import SaleSummary from "../../models/sale/saleSummary.js";

const router = express.Router();

// Helper function
const generateFallbackMRId = (index) => {
  return `MR${String(index + 1).padStart(3, "0")}`;
};

router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 7, search, startDate, endDate } = req.query;

    const skip = (page - 1) * limit;

    const matchConditions = { dueAmount: { $gt: 0 } };

    if (search?.trim()) {
      matchConditions.mrName = { $regex: search.trim(), $options: "i" };
    }

    if (startDate && endDate) {
      matchConditions.invoiceDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const pipeline = [
      { $match: matchConditions },
      {
        $addFields: {
          _mrNameNormalized: {
            $toLower: { $trim: { input: "$mrName" } },
          },
        },
      },
      {
        $group: {
          _id: "$_mrNameNormalized",
          mrName: { $first: "$mrName" },
          totalOutstandingAmount: { $sum: "$dueAmount" },
          uniqueCustomers: { $addToSet: "$customerCode" },
        },
      },
      {
        $lookup: {
          from: "staffs",
          let: { name: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [
                    { $toLower: { $trim: { input: "$medicalRepName" } } },
                    "$$name",
                  ],
                },
              },
            },
          ],
          as: "staff",
        },
      },
      {
        $project: {
          mrName: 1,
          totalOutstandingAmount: 1,
          totalCustomers: { $size: "$uniqueCustomers" },
          staff: { $arrayElemAt: ["$staff", 0] },
        },
      },
      { $sort: { totalOutstandingAmount: -1 } },
    ];

    const data = await SaleSummary.aggregate([
      ...pipeline,
      { $skip: skip },
      { $limit: parseInt(limit) },
    ]);

    const totalCount = await SaleSummary.aggregate([
      ...pipeline,
      { $count: "count" },
    ]);

    res.json({
      data: {
        records: data.map((mr, i) => ({
          mrId: mr.staff?.MRId
            ? String(mr.staff.MRId).padStart(3, "0")
            : generateFallbackMRId(i),
          mrName: mr.mrName,
          totalOutstandingAmount: mr.totalOutstandingAmount,
          totalCustomers: mr.totalCustomers,
          staff: {
            contactNo: mr.staff?.contactNo || "Not Available",
            email: mr.staff?.email || "Not Available",
          },
        })),
        summary: {
          totalOutstandingAmount: data.reduce(
            (sum, d) => sum + d.totalOutstandingAmount,
            0
          ),
          totalCustomers: data.reduce(
            (sum, d) => sum + d.totalCustomers,
            0
          ),
          totalMRs: totalCount[0]?.count || 0,
        },
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil((totalCount[0]?.count || 0) / limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


router.get("/customers/:mrName", async (req, res) => {
  try {
    const decodedMrName = decodeURIComponent(req.params.mrName).trim();

    const matchConditions = {
      dueAmount: { $gt: 0 },
      mrName: { $regex: new RegExp(`^${decodedMrName}$`, "i") },
    };

    const customers = await SaleSummary.aggregate([
      { $match: matchConditions },

      {
        $group: {
          _id: "$customerCode",
          customerName: { $first: "$customerName" },
          totalDue: { $sum: "$dueAmount" },
        },
      },

      {
        $lookup: {
          from: "customers",
          localField: "_id",
          foreignField: "customerCode",
          pipeline: [
            {
              $project: {
                contactNo: 1,
                phone: 1,
                mobile: 1,
                address: 1,
                province: 1,
              },
            },
          ],
          as: "customerInfo",
        },
      },

      {
        $addFields: {
          customer: { $arrayElemAt: ["$customerInfo", 0] },
        },
      },

      {
        $project: {
          customerCode: "$_id",
          customerName: 1,
          totalDue: { $round: ["$totalDue", 2] },

          // ✅ FIXED CONTACT FIELD
          contact: {
            $ifNull: [
              "$customer.contactNo",
              {
                $ifNull: [
                  "$customer.phone",
                  {
                    $ifNull: ["$customer.mobile", "N/A"],
                  },
                ],
              },
            ],
          },

          address: { $ifNull: ["$customer.address", "N/A"] },
          province: { $ifNull: ["$customer.province", "N/A"] },
        },
      },

      { $sort: { totalDue: -1 } },
    ]);

    res.json({ success: true, data: customers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


router.get("/export/excel", async (req, res) => {
  try {
    const { search, startDate, endDate } = req.query;

    const matchConditions = { dueAmount: { $gt: 0 } };

    if (search?.trim()) {
      matchConditions.mrName = { $regex: search.trim(), $options: "i" };
    }

    if (startDate && endDate) {
      matchConditions.invoiceDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // ✅ MAIN DATA (MR + CUSTOMER)
    const data = await SaleSummary.aggregate([
      { $match: matchConditions },

      {
        $group: {
          _id: {
            mrName: "$mrName",
            customerCode: "$customerCode",
          },
          mrName: { $first: "$mrName" },
          customerName: { $first: "$customerName" },
          totalDue: { $sum: "$dueAmount" },
        },
      },

      {
        $lookup: {
          from: "customers",
          localField: "_id.customerCode",
          foreignField: "customerCode",
          pipeline: [
            {
              $project: {
                contactNo: 1,
                phone: 1,
                mobile: 1,
                address: 1,
                province: 1,
              },
            },
          ],
          as: "customerInfo",
        },
      },

      {
        $addFields: {
          customer: { $arrayElemAt: ["$customerInfo", 0] },
        },
      },

      {
        $project: {
          mrName: 1,
          customerName: 1,
          totalDue: { $round: ["$totalDue", 2] },

          // ✅ FIX CONTACT
          contact: {
            $ifNull: [
              "$customer.contactNo",
              {
                $ifNull: [
                  "$customer.phone",
                  {
                    $ifNull: ["$customer.mobile", "N/A"],
                  },
                ],
              },
            ],
          },

          address: { $ifNull: ["$customer.address", "N/A"] },
          province: { $ifNull: ["$customer.province", "N/A"] },
        },
      },

      { $sort: { mrName: 1, totalDue: -1 } },
    ]);

    // ✅ CREATE EXCEL
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("MR Customer Outstanding");

    worksheet.columns = [
      { header: "Sr.No", key: "sr", width: 10 },
      { header: "MR Name", key: "mrName", width: 25 },
      { header: "Customer Name", key: "customerName", width: 30 },
      { header: "Contact", key: "contact", width: 18 },
      { header: "Address", key: "address", width: 35 },
      { header: "Province", key: "province", width: 20 },
      { header: "Unpaid Amount ($)", key: "amount", width: 18 },
    ];

    // Header style
    worksheet.getRow(1).font = { bold: true };

    // Add rows
    data.forEach((item, index) => {
      worksheet.addRow({
        sr: index + 1,
        mrName: item.mrName,
        customerName: item.customerName,
        contact: item.contact,
        address: item.address,
        province: item.province,
        amount: item.totalDue,
      });
    });

    // Format currency
    worksheet.getColumn("amount").numFmt = "$#,##0.00";

    // Optional: Borders
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    // File name
    const fileName = "mr-customer-outstanding.xlsx";

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);

  } catch (error) {
    console.error("Excel export error:", error);
    res.status(500).json({ error: "Failed to export Excel" });
  }
});

export default router;