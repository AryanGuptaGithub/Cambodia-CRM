import express from "express";
import DailySampleReport from "../../models/reports/dailysample.js";

const router = express.Router();

router.post("/dailysample/import", async (req, res) => {
  try {
    const data = req.body;

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ message: "No data provided" });
    }

    // Filter and map entries to match schema and do basic validation
    const validEntries = data
      .map((entry) => {
        // Basic required fields check
        if (
          !entry.requestNumber ||
          !entry.date ||
          !entry.mrName ||
          !entry.productName
        ) {
          return null;
        }

        // Convert date string/number to Date object
        const parsedDate = new Date(entry.date);
        if (isNaN(parsedDate)) {
          return null;
        }

        return {
          requestNumber: entry.requestNumber,
          date: parsedDate,
          mrName: entry.mrName,
          description: entry.description || "",
          productName: entry.productName,
          qtyBigBox: Number(entry.qtyBigBox) || 0,
          qtySmallBox: Number(entry.qtySmallBox) || 0,
          totalQty: Number(entry.totalQty) || 0,
          qtyPerBox: Number(entry.qtyPerBox) || 0,
          remark: entry.remark || "",
        };
      })
      .filter(Boolean); // remove nulls (invalid entries)

    if (validEntries.length === 0) {
      return res.status(400).json({
        message: "No valid daily sample records found in the uploaded file.",
      });
    }

    await DailySampleReport.insertMany(validEntries);

    res
      .status(200)
      .json({ message: "Daily Sample Reports imported successfully!" });
  } catch (err) {
    console.error("❌ Import Error:", err);
    res.status(500).json({ message: "Server error while importing data." });
  }
});

router.get("/dailysample", async (req, res) => {
  try {
    const reports = await DailySampleReport.find().sort({ createdAt: -1 });
    res.status(200).json({ reports });
  } catch (err) {
    console.error("❌ Fetch Error:", err);
    res.status(500).json({ message: "Failed to fetch daily sample reports." });
  }
});

router.put("/dailysample/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await DailySampleReport.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ message: "Report not found" });
    }

    res.status(200).json(updated);
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ message: "Server error while updating report." });
  }
});

router.delete("/dailysample/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await DailySampleReport.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Daily sample report not found" });
    }

    res
      .status(200)
      .json({ message: "Daily sample report deleted successfully" });
  } catch (err) {
    console.error("❌ Delete Error:", err);
    res.status(500).json({ message: "Server error while deleting record" });
  }
});

router.delete("/dailysample", async (req, res) => {
  try {
    let { ids } = req.body; // expecting array of { id: '...' } or string ids

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No IDs provided for deletion" });
    }
    ids = ids.map((item) => (typeof item === "string" ? item : item.id));
    const result = await DailySampleReport.deleteMany({ _id: { $in: ids } });

    res.status(200).json({
      message: `${result.deletedCount} record(s) deleted successfully`,
    });
  } catch (error) {
    console.error("Delete multiple error:", error);
    res.status(500).json({ message: "Server error while deleting records" });
  }
});

router.post("/dailysample", async (req, res) => {
  try {
    const {
      requestNumber,
      date,
      mrName,
      description,
      productName,
      qtyBigBox = 0,
      qtySmallBox = 0,
      totalQty = 0,
      qtyPerBox = 0,
      remark,
    } = req.body;

    // Optional: Validate values (e.g., non-negative numbers)
    if (qtyBigBox < 0 || qtySmallBox < 0 || totalQty < 0 || qtyPerBox < 0) {
      return res
        .status(400)
        .json({ message: "Quantities must be 0 or greater" });
    }

    // Create and save the report
    const report = new DailySampleReport({
      requestNumber,
      date,
      mrName,
      description,
      productName,
      qtyBigBox,
      qtySmallBox,
      totalQty,
      qtyPerBox,
      remark,
    });

    await report.save();

    res.status(201).json({
      message: `Daily sample report <b>${report.productName} - ${report.mrName}</b> added successfully`,
      data: report,
    });
  } catch (error) {
    console.error("Error saving daily sample report:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
