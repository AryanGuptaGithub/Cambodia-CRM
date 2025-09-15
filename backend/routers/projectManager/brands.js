const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const unzipper = require("unzipper");
const { Readable } = require("stream");

const Brand = require("../../models/projectManger/brands");
const { uploadCompanyLogo } = require("../../utils/cloudinary");

const upload = multer({ storage: multer.memoryStorage() });

// Helper to process a buffer (ZIP buffer or image buffer)
async function processZipBuffer(buffer, results) {
  const zipStream = Readable.from(buffer).pipe(unzipper.Parse({ forceStream: true }));
  for await (const entry of zipStream) {
    const entryPath = entry.path;
    const fileName = path.basename(entryPath);
    const ext = path.extname(fileName).toLowerCase();

    if (entry.type === "Directory") {
      entry.autodrain();
      continue;
    }

    if (!fileName) {
      entry.autodrain();
      continue;
    }

    if (ext === ".zip") {
      const chunks = [];
      for await (const chunk of entry) {
        chunks.push(chunk);
      }
      const nestedBuffer = Buffer.concat(chunks);
      await processZipBuffer(nestedBuffer, results);
    }
    else if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
      const chunks = [];
      for await (const chunk of entry) {
        chunks.push(chunk);
      }
      const imgBuffer = Buffer.concat(chunks);
      if (!imgBuffer || imgBuffer.length === 0) {
        continue;
      }

      const uploadRes = await uploadCompanyLogo({
        buffer: imgBuffer,
        originalname: fileName,
      });

      if (!uploadRes || !uploadRes.secure_url) {
        continue;
      }

      const brandUrl = uploadRes.secure_url;
      const brandName = path.parse(fileName).name;
      const brandDoc = new Brand({ brandName, brandUrl });
      await brandDoc.save();
      results.push({ brandName, brandUrl });
    }
    else {
      entry.autodrain();
    }
  }
}

router.post("/upload-brands", upload.single("photosZip"), async (req, res) => {
  try {
    const zipFile = req.file;
    if (!zipFile) {
      return res.status(400).json({ error: "ZIP file is required" });
    }
    if (!zipFile.buffer) {
      console.log("❌ zipFile.buffer is missing");
      return res.status(400).json({ error: "Uploaded file is malformed" });
    }

    const results = [];
    await processZipBuffer(zipFile.buffer, results);

    return res.json({
      success: true,
      message: "Processed ZIP and nested ZIPs, uploaded images.",
      count: results.length,
      brands: results,
    });
  } catch (err) {
    console.error("❌ Upload error:", err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
