const express = require("express");
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const unzipper = require('unzipper');
const xlsx = require('xlsx'); 
const brand = require('../../models/projectManger/brands');
const { uploadCompanyLogo } = require('../../utils/cloudinary');
const upload = multer({ storage: multer.memoryStorage() });


  router.post('/upload-brands', upload.single("photosZip"), async (req, res) => {
  try {
    console.log("⏩ Route hit: /upload-brands");

    const zipFile = req.file;
    if (!zipFile) {
      console.error("❌ No ZIP file uploaded");
      return res.status(400).json({ error: "ZIP file required" });
    }

    console.log("📦 ZIP file received:", zipFile.originalname);

    // TEMP folder
    const tempDir = path.join(__dirname, "../temp_photos");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
      console.log("📁 Created temp directory:", tempDir);
    } else {
      console.log("📁 Temp directory already exists:", tempDir);
    }

    // Extract ZIP contents
    console.log("🔓 Extracting ZIP contents...");
    await new Promise((resolve, reject) => {
      const zipStream = unzipper.Parse();

      zipStream.on("entry", (entry) => {
        const fileName = entry.path;
        const fullPath = path.join(tempDir, fileName);
        const dirname = path.dirname(fullPath);

        fs.mkdirSync(dirname, { recursive: true });
        entry.pipe(fs.createWriteStream(fullPath));

        console.log("📂 Extracted file:", fileName);
      });

      zipStream.on("finish", () => {
        console.log("✅ ZIP extraction complete");
        resolve();
      });

      zipStream.on("error", (err) => {
        console.error("❌ ZIP extraction failed:", err);
        reject(err);
      });

      const { Readable } = require("stream");
      const s = new Readable();
      s._read = () => {};
      s.push(zipFile.buffer);
      s.push(null);
      s.pipe(zipStream);
    });

    // Find Excel file
    const files = fs.readdirSync(tempDir);
    console.log("📁 Files extracted:", files);

    const excelFile = files.find((f) => f.endsWith(".xlsx"));
    if (!excelFile) {
      console.error("❌ Excel file not found in ZIP");
      return res.status(400).json({ error: "No Excel file found in ZIP" });
    }

    console.log("📊 Found Excel file:", excelFile);

    // Parse Excel
    const excelPath = path.join(tempDir, excelFile);
    const workbook = xlsx.readFile(excelPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    console.log(`📄 Parsed ${rows.length} rows from Excel`);

    const results = [];

    for (const [i, row] of rows.entries()) {
      const { brandName, imageFileName } = row;
      let brandUrl = null;

      console.log(`➡️ Processing row ${i + 1}:`, row);

      if (imageFileName) {
        const imagePath = path.join(tempDir, imageFileName);
        if (fs.existsSync(imagePath)) {
          console.log(`🖼 Found image file: ${imageFileName}, uploading to Cloudinary...`);

          const fileBuffer = fs.readFileSync(imagePath);
          const uploadRes = await uploadCompanyLogo({
            buffer: fileBuffer,
            originalname: imageFileName,
          });

          brandUrl = uploadRes.secure_url;
          console.log(`✅ Uploaded to Cloudinary: ${brandUrl}`);
        } else {
          console.warn(`⚠️ Image file not found: ${imageFileName}`);
        }
      }

      const brandDoc = new brand({ brandName, brandUrl });
      await brandDoc.save();
      console.log(`💾 Saved brand to DB: ${brandName}`);

      results.push({ brandName, brandUrl });
    }

    console.log("🎉 Upload complete. Total brands saved:", results.length);
    res.json({ success: true, results });

  } catch (err) {
    console.error("❌ Upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

