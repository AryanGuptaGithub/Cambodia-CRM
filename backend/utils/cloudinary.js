// utils/cloudinary.js
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";

dotenv.config();

console.log("🔧 Loading Cloudinary configuration...");
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
console.log("✅ Cloudinary configured successfully");

export function uploadCompanyLogo(file, publicId = null) {
  console.log("📤 Called uploadCompanyLogo");

  return new Promise((resolve, reject) => {
    if (!file) {
      console.warn("⚠️ No file provided for upload");
      return resolve(null);
    }

    console.log("📄 File original name:", file.originalname);
    const filename = publicId || file.originalname.split(".")[0];
    console.log("📝 Resolved public_id:", filename);

    const uploadOptions = {
      folder: "company",          // Folder name in Cloudinary
      public_id: filename,        // Public ID (file name or custom)
      overwrite: true,            // Replace if exists
      resource_type: "image",     // It's an image
      use_filename: true,         // Use original filename
      unique_filename: false      // Don't add random strings
    };

    console.log("⚙️ Upload options:", uploadOptions);

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error("❌ Cloudinary upload error:", error);
          return reject(error);
        }

        console.log("✅ Cloudinary upload successful!");
        console.log("🔗 Uploaded URL:", result.secure_url);
        console.log("📦 Full result:", result);

        resolve(result);
      }
    );

    console.log("📤 Starting stream upload to Cloudinary...");
    const readStream = streamifier.createReadStream(file.buffer);

    readStream.on("data", (chunk) => {
      console.log(`📦 Streaming chunk (${chunk.length} bytes)...`);
    });

    readStream.on("end", () => {
      console.log("🏁 Finished streaming to Cloudinary.");
    });

    readStream.on("error", (err) => {
      console.error("💥 Read stream error:", err);
      reject(err);
    });

    readStream.pipe(uploadStream);
  });
}

export { cloudinary };
