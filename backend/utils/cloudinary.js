require("dotenv").config();
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const streamifier = require("streamifier");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage() });

function uploadCompanyLogo(file, fixedPublicId = "company/logo", oldPublicId = null) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "company",          
        public_id: fixedPublicId,   
        overwrite: true,
        resource_type: "image",
        use_filename: true,
        unique_filename: false,
      },
      async (error, result) => {
        if (error) return reject(error);

        if (oldPublicId && oldPublicId !== fixedPublicId) {
          try {
            await cloudinary.uploader.destroy(oldPublicId);
          } catch (err) {
            console.warn("Error deleting old logo:", err.message);
          }
        }

        resolve(result);
      }
    );

    streamifier.createReadStream(file.buffer).pipe(uploadStream);
  });
}

module.exports = {
  upload,           
  uploadCompanyLogo, 
};
