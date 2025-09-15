// routers/projectManager/brands.js
import express from "express";
import multer from "multer";
import path from "path";
import unzipper from "unzipper";
import { Readable } from "stream";
import xlsxLib from "xlsx";

import Brand from "../../models/projectManger/brands.js";
import { uploadCompanyLogo } from "../../utils/cloudinary.js";

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/upload-brands",
  upload.fields([
    { name: "excelFile", maxCount: 1 },
    { name: "images", maxCount: 20 },
  ]),
  async (req, res) => {
    try {
      if (!req.files || !req.files.excelFile || req.files.excelFile.length === 0) {
        return res.status(400).json({ error: "Excel file is required" });
      }

      const excelFile = req.files.excelFile[0];
      const workbook = xlsxLib.read(excelFile.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsxLib.utils.sheet_to_json(sheet, { defval: "" });

      const excelBrandMap = new Map(); 
      for (const row of rows) {
        let brandNameRaw = row["Brand Name"] || row["brandName"] || row["brand_name"] || row["brand name"];
        let brandSlugRaw = row["Brand Slug"] || row["brandSlug"] || row["brand_slug"] || row["brand slug"];

        if (!brandNameRaw || !brandSlugRaw) {
          continue;
        }

        const brandNameNorm = brandNameRaw.toString().trim();
        const brandSlugNorm = brandSlugRaw.toString().trim();
        const normKey = brandNameNorm.toLowerCase();

        excelBrandMap.set(normKey, {
          brandName: brandNameNorm,
          brandSlug: brandSlugNorm,
        });
      }

      const results = [];
      const mismatches = [];

      if (req.files.images && req.files.images.length > 0) {
        for (const imgFile of req.files.images) {
          const fileName = imgFile.originalname;
          const ext = path.extname(fileName).toLowerCase();
          const baseName = path.basename(fileName, ext);

          if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
            continue;
          }

          const normImgName = baseName.toString().trim().toLowerCase();

          if (!excelBrandMap.has(normImgName)) {
            mismatches.push({ imageFile: fileName, reason: "No matching Excel brand name" });
            continue;
          }

          const { brandName, brandSlug } = excelBrandMap.get(normImgName);

          const uploadRes = await uploadCompanyLogo({
            buffer: imgFile.buffer,
            originalname: fileName,
          });

          if (!uploadRes?.secure_url) {
            mismatches.push({ imageFile: fileName, reason: "Upload failed" });
            continue;
          }

          const brandUrl = uploadRes.secure_url;

          const brandDoc = new Brand({
            brandName,
            brandSlug,
            brandUrl,
          });
          await brandDoc.save();

          results.push({ brandName, brandSlug, brandUrl, imageFile: fileName });

          excelBrandMap.delete(normImgName);
        }
      } 

      return res.json({
        success: true,
        message: "Excel and images processed",
        matches: results.length,
        mismatches,
        processed: results,
      });

    } catch (err) {
      console.error("❌ Upload error:", err);
      return res.status(500).json({ error: err.message });
    }
  }
);



router.get("/brands", async (req, res) => {
  try {
    const brands = await Brand.find();  // Fetch all documents
    return res.json({
      success: true,
      count: brands.length,
      brands: brands
    });
  } catch (err) {
    console.error("❌ Fetch all brands error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router; // ✅ ESM export
