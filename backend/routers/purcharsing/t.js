// 🔥 IMPROVED: Keep + , - , & in product names – they are important!
const normalizeProductName = (name) => {
  if (!name || typeof name !== "string") return "";

  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")           // Multiple spaces → single
    .replace(/[-_\/\\]/g, " ")      // Dashes, slashes → space (safe)
    .replace(/alu\s*alu/gi, "alu alu") // Standardize ALU ALU
    .trim();
};

// 🔥 Keep + in fix map keys too!
const productNameFixMap = {
  "n-lycopene + wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",
  "n lycopene + wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",
  "n-lycopene+wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",
  "lycopene + wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",

  "n flaxseed oil": "N-FLAXSEED OIL",
  "flaxseed oil": "N-FLAXSEED OIL",

  "n evening primrose oil": "N-EVENING PRIMROSE OIL",
  "evening primrose oil": "N-EVENING PRIMROSE OIL",

  "n multiz": "N-MULTIZ",
  multiz: "N-MULTIZ",

  "n garlic oil": "N-GARLIC OIL",
  "garlic oil": "N-GARLIC OIL",

  "n fenugreek oil": "N-FENUGREEK OIL",
  "fenugreek oil": "N-FENUGREEK OIL",

  "n nigella oil": "N-NIGELLA OIL",
  "nigella oil": "N-NIGELLA OIL",

  "n krill oil": "N-KRILL OIL",
  "krill oil": "N-KRILL OIL",

  "n sea buckthorn & oil lutein extract": "N-SEA BUCKTHORN & OIL LUTEIN EXTRACT",
  "sea buckthorn & oil lutein extract": "N-SEA BUCKTHORN & OIL LUTEIN EXTRACT",

  "ecomol 500": "ECOMOL 500",
  "ecomol500": "ECOMOL 500",
  "ecomol": "ECOMOL 500",

  // ALU ALU ECOCID
  "alu alu ecocid 20": "ALU ALU ECOCID 20",
  "alualu ecocid 20": "ALU ALU ECOCID 20",
  "ecocid 20 alu alu": "ALU ALU ECOCID 20",
  "ecocid alu alu 20": "ALU ALU ECOCID 20",
  "ecocid 20": "ALU ALU ECOCID 20",
};

// 🔥 FIXED: Do NOT remove + during normalization
const findProductStockInHand = async (productName, requiredQty) => {
  console.log("\n=== STOCK CHECK START ===");
  console.log(`Original product from Excel: "${productName}"`);
  console.log(`Required quantity: ${requiredQty}`);

  try {
    const normalized = normalizeProductName(productName);
    console.log(`Normalized: "${normalized}"`);

    const fixedName = productNameFixMap[normalized] || productName.trim();
    console.log(`After fix map: "${fixedName}"`);

    // 🔥 Only escape regex special chars, DO NOT remove +
    const escaped = fixedName.replace(/[.*?^${}()|[\]\\]/g, "\\$&");
    console.log(`Regex escaped: "${escaped}"`);

    // 1. Try exact match (case-insensitive)
    let stockItems = await ReportInHand.find({
      productName: { $regex: new RegExp(`^${escaped}$`, "i") },
    }).sort({ expiryDate: 1 });

    console.log(`Exact match found: ${stockItems.length} item(s)`);

    // 2. Fallback: partial contains match
    if (stockItems.length === 0) {
      console.log("Trying partial contains match...");
      stockItems = await ReportInHand.find({
        productName: { $regex: escaped, $options: "i" },
      }).sort({ expiryDate: 1 });
      console.log(`Contains match found: ${stockItems.length} item(s)`);
    }

    // 3. Final fallback: direct string search in all documents
    if (stockItems.length === 0) {
      console.log("Trying full scan fallback...");
      const allItems = await ReportInHand.find({});
      stockItems = allItems.filter(item =>
        normalizeProductName(item.productName) === normalized ||
        item.productName.toLowerCase().includes(normalized) ||
        normalized.includes(normalizeProductName(item.productName))
      );
      console.log(`Fallback scan found: ${stockItems.length} item(s)`);
    }

    if (stockItems.length === 0) {
      console.log(`❌ NO PRODUCT FOUND for "${productName}"`);
      console.log("=== STOCK CHECK END (NO PRODUCT) ===\n");
      return {
        insufficient: true,
        availableStock: 0,
        message: `Product "${productName}" not found in stock`,
      };
    }

    // Log found items
    stockItems.forEach((item, i) => {
      console.log(`  [${i + 1}] DB: "${item.productName}" | Boxes: ${item.totalBoxes}`);
    });

    const available = stockItems.reduce((sum, item) => sum + (item.totalBoxes || 0), 0);
    console.log(`Total available stock: ${available}`);

    if (available < requiredQty) {
      console.log(`❌ INSUFFICIENT STOCK: Need ${requiredQty}, Have ${available}`);
      console.log("=== STOCK CHECK END (INSUFFICIENT) ===\n");
      return {
        insufficient: true,
        availableStock: available,
        message: `Insufficient stock for "${productName}". Required: ${requiredQty}, Available: ${available}`,
      };
    }

    console.log(`✅ SUFFICIENT STOCK: ${available} >= ${requiredQty}`);
    console.log("=== STOCK CHECK END (SUCCESS) ===\n");
    return { insufficient: false, availableStock: available };
  } catch (error) {
    console.error("🚨 STOCK CHECK ERROR:", error.message);
    console.log("=== STOCK CHECK END (ERROR) ===\n");
    return { insufficient: true, availableStock: 0, message: error.message };
  }
};

// 🔥 FIXED: Same logic in consumeStockFromHand
const consumeStockFromHand = async (productName, requiredQty, session) => {
  try {
    const normalized = normalizeProductName(productName);
    const fixedName = productNameFixMap[normalized] || productName.trim();
    const escaped = fixedName.replace(/[.*?^${}()|[\]\\]/g, "\\$&");

    let stockItems = await ReportInHand.find({
      productName: { $regex: new RegExp(`^${escaped}$`, "i") },
    })
      .sort({ expiryDate: 1 })
      .session(session);

    if (stockItems.length === 0) {
      stockItems = await ReportInHand.find({
        productName: { $regex: escaped, $options: "i" },
      })
        .sort({ expiryDate: 1 })
        .session(session);
    }

    if (stockItems.length === 0) {
      // Final fallback scan
      const allItems = await ReportInHand.find({}).session(session);
      stockItems = allItems.filter(item =>
        normalizeProductName(item.productName) === normalized
      );
    }

    if (stockItems.length === 0) {
      throw new Error(`No stock found for ${productName}`);
    }

    let remaining = requiredQty;

    // FIFO: oldest first
    for (const item of stockItems) {
      if (remaining <= 0) break;

      let itemRemaining = item.totalBoxes || 0;
      while (itemRemaining > 0 && remaining > 0 && item.batches.length > 0) {
        const batch = item.batches[0]; // oldest batch
        const take = Math.min(batch.boxes, remaining, itemRemaining);

        batch.boxes -= take;
        batch.amount = batch.boxes * (batch.lc || 0);
        remaining -= take;
        itemRemaining -= take;

        // Remove empty batch
        if (batch.boxes <= 0) {
          item.batches.shift();
        }
      }

      item.totalBoxes = item.batches.reduce((sum, b) => sum + b.boxes, 0);
      item.totalAmount = item.batches.reduce((sum, b) => sum + b.amount, 0);
      item.updatedAt = new Date();
      await item.save({ session });
    }

    if (remaining > 0) {
      throw new Error(`Could only deduct ${requiredQty - remaining} of ${requiredQty} for ${productName}`);
    }

    return { success: true };
  } catch (error) {
    throw error;
  }
};