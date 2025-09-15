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
    { name: "images", maxCount: 20 },  // adjust maxCount as needed
  ]),
  async (req, res) => {
    try {
      if (!req.files || !req.files.excelFile || req.files.excelFile.length === 0) {
        return res.status(400).json({ error: "Excel file is required" });
      }

      const excelFile = req.files.excelFile[0];
      const results = [];

      // Parse Excel
      const workbook = xlsxLib.read(excelFile.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsxLib.utils.sheet_to_json(sheet);
    
      // Save each row's brandName & brandSlug from excel
      for (const row of rows) {
        if (row.brandName && row.brandSlug) {
          const doc = new Brand({
            brandName: row.brandName,
            brandSlug: row.brandSlug,
          });
          await doc.save();
          console.log("✅ Saved from Excel:", row.brandName, row.brandSlug);
          results.push({ brandName: row.brandName, brandSlug: row.brandSlug });
        } else {
          console.log("⚠️ Skipping Excel row, missing fields:", row);
        }
      }

      // Process image blobs if any
      if (req.files.images && req.files.images.length > 0) {
        for (const imgFile of req.files.images) {
          const fileName = imgFile.originalname;
          const ext = path.extname(fileName).toLowerCase();

          if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
            continue;
          }

          const uploadRes = await uploadCompanyLogo({
            buffer: imgFile.buffer,
            originalname: fileName,
          });

          if (!uploadRes?.secure_url) {
            console.log("⚠️ Image upload failed for:", fileName);
            continue;
          }

          const brandUrl = uploadRes.secure_url;
          const brandName = path.parse(fileName).name;

          // optionally, you might want to link this image to a brand from excel
          const brandDoc = new Brand({ brandName, brandUrl });
          await brandDoc.save();
          console.log("✅ Saved image brand:", brandName);

          results.push({ brandName, brandUrl });
        }
      } else {
        console.log("ℹ️ No image files uploaded");
      }

      return res.json({
        success: true,
        message: "Excel and images processed",
        count: results.length,
        brands: results,
      });
    } catch (err) {
      console.error("❌ Upload error:", err);
      return res.status(500).json({ error: err.message });
    }
  }
);


export default router; // ✅ ESM export
