import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const inputIcon = path.join(__dirname, "../public/mainlogo.png");
const outputDir = path.join(__dirname, "../public/icons");

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function generateIcons() {
  try {
    // Check if input icon exists
    if (!fs.existsSync(inputIcon)) {
      console.error("❌ mainlogo.png not found in public folder!");
      console.log(
        "Please add mainlogo.png to the public folder and try again.",
      );
      return;
    }

    for (const size of sizes) {
      const outputPath = path.join(outputDir, `icon-${size}x${size}.png`);
      await sharp(inputIcon)
        .resize(size, size, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .png()
        .toFile(outputPath);
      console.log(`✅ Generated ${size}x${size} icon`);
    }

    console.log("\n🎉 All icons generated successfully!");
    console.log(`📁 Icons saved in: ${outputDir}`);
  } catch (error) {
    console.error("❌ Error generating icons:", error);
  }
}

generateIcons();
