// routers/projectManager/brands.js
import express from "express";
import multer from "multer";
import path from "path";
import unzipper from "unzipper";
import { Readable } from "stream";

import Brand from "../../models/projectManger/brands.js";
import { uploadCompanyLogo } from "../../utils/cloudinary.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

async function processZipBufferSkipNested(buffer, results) {
  const zipStream = Readable.from(buffer).pipe(unzipper.Parse({ forceStream: true }));

  for await (const entry of zipStream) {
    const entryPath = entry.path;
    const fileName = path.basename(entryPath);
    const ext = path.extname(fileName).toLowerCase();

    if (entry.type === "Directory" || !fileName || ext === ".zip") {
      entry.autodrain();
      continue;
    }

    if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
      entry.autodrain();
      continue;
    }

    const chunks = [];
    for await (const chunk of entry) {
      chunks.push(chunk);
    }

    const imgBuffer = Buffer.concat(chunks);
    if (!imgBuffer.length) {
      entry.autodrain();
      continue;
    }

    const uploadRes = await uploadCompanyLogo({
      buffer: imgBuffer,
      originalname: fileName,
    });

    if (!uploadRes?.secure_url) {
      entry.autodrain();
      continue;
    }

    const brandUrl = uploadRes.secure_url;
    const brandName = path.parse(fileName).name;
    const brandDoc = new Brand({ brandName, brandUrl });
    await brandDoc.save();

    results.push({ brandName, brandUrl });
  }
}

router.post("/upload-brands", upload.single("photosZip"), async (req, res) => {
  try {
    const zipFile = req.file;
    if (!zipFile || !zipFile.buffer) {
      return res.status(400).json({ error: "ZIP file is required and must be valid" });
    }

    const results = [];
    await processZipBufferSkipNested(zipFile.buffer, results);

    return res.json({
      success: true,
      message: "Processed ZIP (skipped nested ZIPs and unsupported files).",
      count: results.length,
      brands: results,
    });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router; // ✅ ESM export
