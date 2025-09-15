require("dotenv").config();
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function uploadCompanyLogo(file, publicId = null) {
  console.log("📤 Called uploadCompanyLogo");

  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
  
    const filename = publicId || file.originalname.split(".")[0];

    const uploadOptions = {
      folder: "company",          // Folder name in Cloudinary
      public_id: filename,        // Public ID (file name or custom)
      overwrite: true,            // Replace if exists
      resource_type: "image",     // It's an image
      use_filename: true,         // Use original filename
      unique_filename: false      // Don't add random strings
    };

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          return reject(error);
        }
        resolve(result);
      }
    );

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

module.exports = {
  cloudinary,
  uploadCompanyLogo,
};
