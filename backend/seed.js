import { MongoClient } from 'mongodb';

const uri = "mongodb+srv://admin:ni6tP5N63U0Yxvdr@cluster0.2qjjhh8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);

// Collection names
const MR_STOCK_COLLECTION = "stockinmrhands";
const PRODUCT_STOCK_COLLECTION = "reportinhands";

async function run() {
  try {
    await client.connect();
    const db = client.db("test");

    // ------------------- 1. STOCK IN MR HANDS -------------------
    const mrCollection = db.collection(MR_STOCK_COLLECTION);
    const mrDocs = await mrCollection.find({}).toArray();

    console.log("=".repeat(90));
    console.log("📦 STOCK IN MR HANDS");
    console.log("=".repeat(90));

    let totalMrValue = 0;

    if (mrDocs.length === 0) {
      console.log("No MR stock records found.");
    } else {
      mrDocs.forEach((doc, idx) => {
        const mrName = doc.mrName || doc.name || "Unknown MR";
        const products = doc.productsInHand || [];
        let mrTotal = 0;

        for (const prod of products) {
          let value = prod.amount;
          if (value === undefined || value === null) {
            const qty = prod.quantity || 0;
            const lc = prod.lc || 0;
            value = qty * lc;
          }
          mrTotal += value;
        }

        totalMrValue += mrTotal;

        console.log(`\nMR #${idx + 1} : ${mrName}`);
        console.log(`   Products : ${products.length}`);
        console.log(`   Value    : $${mrTotal.toFixed(2)}`);
      });
    }

    console.log(`\n💰 TOTAL VALUE (MR HANDS) : $${totalMrValue.toFixed(2)}`);

    // ------------------- 2. REPORT IN HANDS (Product Stock) -------------------
    const productCollection = db.collection(PRODUCT_STOCK_COLLECTION);
    const productDocs = await productCollection.find({}).toArray();

    console.log("\n" + "=".repeat(90));
    console.log("📦 REPORT IN HANDS (Product Stock)");
    console.log("=".repeat(90));

    let totalProductValue = 0;

    if (productDocs.length === 0) {
      console.log("No product stock records found.");
    } else {
      productDocs.forEach((doc, idx) => {
        // Prefer totalAmount, otherwise compute from batches
        let productTotal = doc.totalAmount;
        if (productTotal === undefined || productTotal === null) {
          // Fallback: sum of amount from each batch
          const batches = doc.batches || [];
          productTotal = batches.reduce((sum, batch) => sum + (batch.amount || 0), 0);
        }

        totalProductValue += productTotal;

        const productName = doc.productName || `Product #${idx + 1}`;
        console.log(`\n${productName} :`);
        console.log(`   Total stock value : $${productTotal.toFixed(2)}`);
        if (doc.batches && doc.batches.length) {
          console.log(`   Batches : ${doc.batches.length}`);
        }
      });
    }

    console.log(`\n💰 TOTAL VALUE (Product Stock) : $${totalProductValue.toFixed(2)}`);

    // ------------------- 3. GRAND TOTAL -------------------
    console.log("\n" + "=".repeat(90));
    console.log(`🏆 GRAND TOTAL (MR Hands + Product Stock) : $${(totalMrValue + totalProductValue).toFixed(2)}`);
    console.log("=".repeat(90));

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.close();
  }
}

run();