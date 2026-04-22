import express from "express";
import Customer from "../../models/master/customer.js";
import ExcelJS from "exceljs";

const router = express.Router();

// ── Placeholder strings that mean "no value provided" ────────────────────────
const INVALID_VALUES = [
  "not provided",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "-",
  "--",
  "unknown",
  "",
];

// ── JS helper: returns true if a string is a real/meaningful value ────────────
const isValid = (val) => {
  if (!val) return false;
  return !INVALID_VALUES.includes(val.trim().toLowerCase());
};

// ── JS helper: derive the group label for a customer (used in exports) ────────
// Priority: zone → province → address → "Not Provided"
const getGroupLabel = (customer) => {
  if (isValid(customer.zone)) return customer.zone.trim();
  if (isValid(customer.province)) return customer.province.trim();
  if (isValid(customer.address)) return customer.address.trim();
  return "Not Provided";
};

// ── MongoDB expression: true if the field is a real value ────────────────────
const validFieldExpr = (field) => ({
  $and: [
    { $gt: [{ $type: field }, "missing"] },
    { $ne: [field, null] },
    {
      $not: {
        $in: [
          { $toLower: { $trim: { input: { $ifNull: [field, ""] } } } },
          INVALID_VALUES,
        ],
      },
    },
  ],
});

// ── Group key expression (lowercase, for dedup/grouping) ─────────────────────
// Priority: zone → province → address → "not provided"
const groupKeyExpr = {
  $cond: {
    if: validFieldExpr("$zone"),
    then: { $toLower: { $trim: { input: "$zone" } } },
    else: {
      $cond: {
        if: validFieldExpr("$province"),
        then: { $toLower: { $trim: { input: "$province" } } },
        else: {
          $cond: {
            if: validFieldExpr("$address"),
            then: { $toLower: { $trim: { input: "$address" } } },
            else: "not provided",
          },
        },
      },
    },
  },
};

// ── Display label expression (preserves original casing for UI) ──────────────
// Priority: zone → province → address → "Not Provided"
const groupDisplayExpr = {
  $cond: {
    if: validFieldExpr("$zone"),
    then: { $trim: { input: "$zone" } },
    else: {
      $cond: {
        if: validFieldExpr("$province"),
        then: { $trim: { input: "$province" } },
        else: {
          $cond: {
            if: validFieldExpr("$address"),
            then: { $trim: { input: "$address" } },
            else: "Not Provided",
          },
        },
      },
    },
  },
};

// ── Reusable Mongoose filter: checks if a field is invalid/missing ────────────
const invalidFieldFilter = (fieldName) => ({
  $or: [
    { [fieldName]: { $exists: false } },
    { [fieldName]: null },
    {
      $expr: {
        $in: [
          {
            $toLower: { $trim: { input: { $ifNull: [`$${fieldName}`, ""] } } },
          },
          INVALID_VALUES,
        ],
      },
    },
  ],
});

// ── Build Mongoose filter to fetch customers belonging to a group ──────────────
// groupKey is always lowercase (as stored in _id from aggregation)
const buildGroupFilter = (groupKey) => {
  // ── "Not Provided": zone, province AND address are all invalid ────────────
  if (groupKey === "not provided") {
    return {
      $and: [
        invalidFieldFilter("zone"),
        invalidFieldFilter("province"),
        invalidFieldFilter("address"),
      ],
    };
  }

  // ── Normal key: could be a zone, province, or address value ──────────────
  // Try to match in priority order using $or:
  //   1. zone is valid and matches this key
  //   2. zone is invalid, province is valid and matches
  //   3. zone AND province are invalid, address is valid and matches
  return {
    $or: [
      // 1. Valid zone matches
      {
        $and: [
          {
            $expr: {
              $eq: [
                { $toLower: { $trim: { input: { $ifNull: ["$zone", ""] } } } },
                groupKey,
              ],
            },
          },
          {
            $expr: {
              $not: {
                $in: [
                  {
                    $toLower: { $trim: { input: { $ifNull: ["$zone", ""] } } },
                  },
                  INVALID_VALUES,
                ],
              },
            },
          },
        ],
      },
      // 2. Zone invalid → valid province matches
      {
        $and: [
          invalidFieldFilter("zone"),
          {
            $expr: {
              $eq: [
                {
                  $toLower: {
                    $trim: { input: { $ifNull: ["$province", ""] } },
                  },
                },
                groupKey,
              ],
            },
          },
          {
            $expr: {
              $not: {
                $in: [
                  {
                    $toLower: {
                      $trim: { input: { $ifNull: ["$province", ""] } },
                    },
                  },
                  INVALID_VALUES,
                ],
              },
            },
          },
        ],
      },
      // 3. Zone AND province invalid → valid address matches
      {
        $and: [
          invalidFieldFilter("zone"),
          invalidFieldFilter("province"),
          {
            $expr: {
              $eq: [
                {
                  $toLower: { $trim: { input: { $ifNull: ["$address", ""] } } },
                },
                groupKey,
              ],
            },
          },
          {
            $expr: {
              $not: {
                $in: [
                  {
                    $toLower: {
                      $trim: { input: { $ifNull: ["$address", ""] } },
                    },
                  },
                  INVALID_VALUES,
                ],
              },
            },
          },
        ],
      },
    ],
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /  (paginated list)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 7, search = "" } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    let matchStage = { enabled: true };

    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      matchStage.$or = [
        { zone: searchRegex },
        { province: searchRegex },
        { address: searchRegex },
        { name: searchRegex },
        { customerCode: searchRegex },
        { medicalRepName: searchRegex },
      ];
    }

    const zonesAggregation = [
      { $match: matchStage },
      {
        $group: {
          _id: groupKeyExpr, // lowercase key for dedup
          zoneName: { $first: groupDisplayExpr }, // pretty display name
          totalCustomers: { $sum: 1 },
          totalMRs: { $addToSet: "$medicalRepName" },
        },
      },
      {
        $project: {
          zoneName: 1,
          totalCustomers: 1,
          totalMRs: { $size: "$totalMRs" },
          averagePerMR: {
            $cond: [
              { $gt: [{ $size: "$totalMRs" }, 0] },
              { $divide: ["$totalCustomers", { $size: "$totalMRs" }] },
              0,
            ],
          },
        },
      },
      { $sort: { totalCustomers: -1 } },
      {
        $facet: {
          paginatedResults: [{ $skip: skip }, { $limit: limitNum }],
          totalCount: [{ $count: "total" }],
        },
      },
    ];

    const [zonesResult] =
      await Customer.aggregate(zonesAggregation).allowDiskUse(true);
    const totalRecords = zonesResult.totalCount[0]?.total || 0;

    const records = [];

    for (const zoneData of zonesResult.paginatedResults) {
      const groupKey = zoneData._id; // lowercase
      const groupFilter = buildGroupFilter(groupKey);

      const zoneCustomers = await Customer.find({
        enabled: true,
        ...groupFilter,
      })
        .select(
          "_id customerCode name typeOfBusiness customerNumber address medicalRepName province zone isNew createdAt remark",
        )
        .sort({ name: 1 })
        .lean();

      records.push({
        zoneId: groupKey
          ? groupKey
              .replace(/[\s()]/g, "_")
              .replace(/_+/g, "_")
              .toUpperCase()
          : "NOT_PROVIDED",
        zoneName: zoneData.zoneName || "Not Provided",
        totalMRs: zoneData.totalMRs || 0,
        totalCustomers: zoneData.totalCustomers || 0,
        averagePerMR: parseFloat((zoneData.averagePerMR || 0).toFixed(1)),
        customers: zoneCustomers.map((c) => ({
          customerId: c._id,
          customerCode: c.customerCode,
          customerName: c.name,
          typeOfBusiness: c.typeOfBusiness,
          contactNumber: c.customerNumber,
          address: c.address,
          medicalRepName: c.medicalRepName,
          province: c.province,
          isNew: c.isNew,
          createdAt: c.createdAt,
          remark: c.remark,
        })),
      });
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const summaryResult = await Customer.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          totalZones: { $addToSet: groupKeyExpr },
          totalMRs: { $addToSet: "$medicalRepName" },
        },
      },
      {
        $project: {
          totalCustomers: 1,
          totalZones: { $size: "$totalZones" },
          totalMRs: { $size: "$totalMRs" },
          averageCustomersPerZone: {
            $cond: [
              { $gt: [{ $size: "$totalZones" }, 0] },
              { $divide: ["$totalCustomers", { $size: "$totalZones" }] },
              0,
            ],
          },
        },
      },
    ]).allowDiskUse(true);

    const summary = summaryResult[0] || {
      totalCustomers: 0,
      totalZones: 0,
      totalMRs: 0,
      averageCustomersPerZone: 0,
    };

    const totalPages = Math.ceil(totalRecords / limitNum);

    res.json({
      success: true,
      data: {
        summary: {
          totalCustomers: summary.totalCustomers || 0,
          totalZones: summary.totalZones || 0,
          totalMRs: summary.totalMRs || 0,
          averageCustomersPerZone: parseFloat(
            (summary.averageCustomersPerZone || 0).toFixed(1),
          ),
        },
        records,
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching zone wise customers:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch zone wise customer data",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /export  (full Excel: Summary + Zones + Customers sheets)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/export", async (req, res) => {
  try {
    const search = req.query.search?.trim() || "";

    let matchStage = { enabled: true };
    if (search) {
      const searchRegex = new RegExp(search, "i");
      matchStage.$or = [
        { zone: searchRegex },
        { province: searchRegex },
        { address: searchRegex },
        { name: searchRegex },
        { customerCode: searchRegex },
        { medicalRepName: searchRegex },
      ];
    }

    const zonesAggregation = [
      { $match: matchStage },
      {
        $group: {
          _id: groupKeyExpr,
          zoneName: { $first: groupDisplayExpr },
          totalCustomers: { $sum: 1 },
          totalMRs: { $addToSet: "$medicalRepName" },
        },
      },
      {
        $project: {
          zoneName: 1,
          totalCustomers: 1,
          totalMRs: { $size: "$totalMRs" },
          averagePerMR: {
            $cond: [
              { $gt: [{ $size: "$totalMRs" }, 0] },
              { $divide: ["$totalCustomers", { $size: "$totalMRs" }] },
              0,
            ],
          },
        },
      },
      { $sort: { totalCustomers: -1 } },
    ];

    const zones = await Customer.aggregate(zonesAggregation).allowDiskUse(true);

    const summaryResult = await Customer.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          totalZones: { $addToSet: groupKeyExpr },
          totalMRs: { $addToSet: "$medicalRepName" },
        },
      },
      {
        $project: {
          totalCustomers: 1,
          totalZones: { $size: "$totalZones" },
          totalMRs: { $size: "$totalMRs" },
          averageCustomersPerZone: {
            $cond: [
              { $gt: [{ $size: "$totalZones" }, 0] },
              { $divide: ["$totalCustomers", { $size: "$totalZones" }] },
              0,
            ],
          },
        },
      },
    ]).allowDiskUse(true);

    const summary = summaryResult[0] || {
      totalCustomers: 0,
      totalZones: 0,
      totalMRs: 0,
      averageCustomersPerZone: 0,
    };

    const workbook = new ExcelJS.Workbook();

    // ── SUMMARY SHEET ─────────────────────────────────────────────────────────
    const summarySheet = workbook.addWorksheet("Summary");
    summarySheet.mergeCells("A1:D1");
    summarySheet.getCell("A1").value = "ZONE WISE CUSTOMERS REPORT";
    summarySheet.getCell("A1").font = { bold: true, size: 16 };
    summarySheet.getCell("A1").alignment = { horizontal: "center" };
    summarySheet.addRow([]);
    summarySheet.addRow(["Report Date:", new Date().toLocaleDateString()]);
    summarySheet.addRow(["Generated At:", new Date().toLocaleTimeString()]);
    if (search) summarySheet.addRow(["Search Filter:", search]);
    summarySheet.addRow([]);
    summarySheet.mergeCells("A6:D6");
    summarySheet.getCell("A6").value = "SUMMARY";
    summarySheet.getRow(6).font = {
      bold: true,
      size: 14,
      color: { argb: "FF0000FF" },
    };
    summarySheet.getRow(6).alignment = { horizontal: "center" };
    const summaryHeaders = summarySheet.addRow(["Metric", "Value", "", ""]);
    summaryHeaders.font = { bold: true };
    summaryHeaders.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
    });
    [
      ["Total Customers", summary.totalCustomers],
      ["Total Zones", summary.totalZones],
      ["Total Medical Representatives", summary.totalMRs],
      [
        "Average Customers per Zone",
        parseFloat((summary.averageCustomersPerZone || 0).toFixed(1)),
      ],
      ["", ""],
      ["Search Applied", search || "None"],
    ].forEach((row) => summarySheet.addRow(row));
    summarySheet.columns = [
      { width: 35 },
      { width: 20 },
      { width: 10 },
      { width: 10 },
    ];

    // ── ZONES SHEET ───────────────────────────────────────────────────────────
    const zonesSheet = workbook.addWorksheet("Zones");
    zonesSheet.mergeCells("A1:E1");
    zonesSheet.getCell("A1").value = "ZONE WISE SUMMARY";
    zonesSheet.getCell("A1").font = { bold: true, size: 16 };
    zonesSheet.getCell("A1").alignment = { horizontal: "center" };
    zonesSheet.addRow([]);
    const zoneHeaderRow = zonesSheet.addRow([
      "Sr. No.",
      "Zone Name",
      "Total Customers",
      "Medical Representatives",
      "Average per MR",
    ]);
    zoneHeaderRow.font = { bold: true };
    zoneHeaderRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      cell.alignment = { horizontal: "center" };
    });
    zones.forEach((zone, index) => {
      const row = zonesSheet.addRow([
        index + 1,
        zone.zoneName || "Not Provided",
        zone.totalCustomers,
        zone.totalMRs,
        parseFloat((zone.averagePerMR || 0).toFixed(1)),
      ]);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
        if (index % 2 === 0) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF9F9F9" },
          };
        }
      });
    });
    zonesSheet.columns = [
      { width: 10 },
      { width: 40 },
      { width: 18 },
      { width: 25 },
      { width: 18 },
    ];

    // ── CUSTOMERS SHEET ───────────────────────────────────────────────────────
    const customersSheet = workbook.addWorksheet("Customers");
    customersSheet.mergeCells("A1:L1");
    customersSheet.getCell("A1").value = "CUSTOMER DETAILS";
    customersSheet.getCell("A1").font = { bold: true, size: 16 };
    customersSheet.getCell("A1").alignment = { horizontal: "center" };
    customersSheet.addRow([]);
    const customerHeaderRow = customersSheet.addRow([
      "Sr. No.",
      "Zone / Group",
      "Customer Code",
      "Customer Name",
      "Type of Business",
      "Contact Number",
      "Medical Representative",
      "Province",
      "Address",
      "Status",
      "Created Date",
      "Remarks",
    ]);
    customerHeaderRow.font = { bold: true };
    customerHeaderRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    let customerCounter = 1;
    let batchSkip = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const customers = await Customer.find(matchStage)
        .select(
          "zone customerCode name typeOfBusiness customerNumber address medicalRepName province isNew createdAt remark",
        )
        .sort({ zone: 1, province: 1, address: 1, name: 1 })
        .skip(batchSkip)
        .limit(batchSize)
        .lean();

      if (customers.length === 0) {
        hasMore = false;
        break;
      }

      customers.forEach((customer) => {
        const row = customersSheet.addRow([
          customerCounter++,
          getGroupLabel(customer),
          customer.customerCode || "N/A",
          customer.name || "N/A",
          customer.typeOfBusiness || "N/A",
          customer.customerNumber || "N/A",
          customer.medicalRepName || "N/A",
          customer.province || "N/A",
          customer.address || "N/A",
          customer.isNew ? "New" : "Existing",
          customer.createdAt
            ? new Date(customer.createdAt).toLocaleDateString()
            : "N/A",
          customer.remark || "",
        ]);
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          if (customerCounter % 2 === 0) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF9F9F9" },
            };
          }
        });
      });
      batchSkip += batchSize;
    }

    customersSheet.columns = [
      { width: 10 },
      { width: 40 },
      { width: 20 },
      { width: 30 },
      { width: 20 },
      { width: 20 },
      { width: 25 },
      { width: 15 },
      { width: 40 },
      { width: 12 },
      { width: 15 },
      { width: 30 },
    ];
    customersSheet.autoFilter = "A1:L1";

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="zone_wise_customers_${Date.now()}.xlsx"`,
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("❌ Excel export error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export data to Excel",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /export-customers  (customer-only Excel)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/export-customers", async (req, res) => {
  try {
    const search = req.query.search?.trim() || "";

    let matchStage = { enabled: true };
    if (search) {
      const searchRegex = new RegExp(search, "i");
      matchStage.$or = [
        { zone: searchRegex },
        { province: searchRegex },
        { address: searchRegex },
        { name: searchRegex },
        { customerCode: searchRegex },
        { medicalRepName: searchRegex },
      ];
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Customer List");

    worksheet.mergeCells("A1:L1");
    worksheet.getCell("A1").value = "CUSTOMER LIST";
    worksheet.getCell("A1").font = { bold: true, size: 16 };
    worksheet.getCell("A1").alignment = { horizontal: "center" };
    worksheet.addRow([]);
    worksheet.addRow(["Report Date:", new Date().toLocaleDateString()]);
    worksheet.addRow(["Generated At:", new Date().toLocaleTimeString()]);
    if (search) worksheet.addRow(["Search Filter:", search]);
    worksheet.addRow([]);
    const totalCustomers = await Customer.countDocuments(matchStage);
    worksheet.addRow(["Total Customers:", totalCustomers]);
    worksheet.addRow([]);

    const headerRow = worksheet.addRow([
      "Sr. No.",
      "Zone / Group",
      "Customer Code",
      "Customer Name",
      "Type of Business",
      "Contact Number",
      "Medical Representative",
      "Province",
      "Address",
      "Status",
      "Created Date",
      "Remarks",
    ]);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    let customerCounter = 1;
    let batchSkip = 0;
    const batchSize = 2000;
    let hasMore = true;

    while (hasMore) {
      const customers = await Customer.find(matchStage)
        .select(
          "zone customerCode name typeOfBusiness customerNumber address medicalRepName province isNew createdAt remark",
        )
        .sort({ zone: 1, province: 1, address: 1, name: 1 })
        .skip(batchSkip)
        .limit(batchSize)
        .lean();

      if (customers.length === 0) {
        hasMore = false;
        break;
      }

      customers.forEach((customer) => {
        const row = worksheet.addRow([
          customerCounter++,
          getGroupLabel(customer),
          customer.customerCode || "N/A",
          customer.name || "N/A",
          customer.typeOfBusiness || "N/A",
          customer.customerNumber || "N/A",
          customer.medicalRepName || "N/A",
          customer.province || "N/A",
          customer.address || "N/A",
          customer.isNew ? "New" : "Existing",
          customer.createdAt
            ? new Date(customer.createdAt).toLocaleDateString()
            : "N/A",
          customer.remark || "",
        ]);
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          if (customerCounter % 2 === 0) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF9F9F9" },
            };
          }
        });
      });
      batchSkip += batchSize;
    }

    worksheet.columns = [
      { width: 10 },
      { width: 40 },
      { width: 20 },
      { width: 30 },
      { width: 20 },
      { width: 20 },
      { width: 25 },
      { width: 15 },
      { width: 40 },
      { width: 12 },
      { width: 15 },
      { width: 30 },
    ];
    worksheet.autoFilter = "A1:L1";
    worksheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="customer_list_${Date.now()}.xlsx"`,
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("❌ Customer list export error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export customer list",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

export default router;
