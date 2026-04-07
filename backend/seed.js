import { MongoClient } from 'mongodb';

const uri = "mongodb+srv://admin:ni6tP5N63U0Yxvdr@cluster0.2qjjhh8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const db = client.db("test");
    const collection = db.collection("reportinhands"); // 👈 change if your collection name is different

    const expiryStockResult = await collection.aggregate([
      // Step 1: Filter batches with expiryDate and boxes > 0
      {
        $addFields: {
          expiryBatches: {
            $filter: {
              input: "$batches",
              as: "batch",
              cond: {
                $and: [
                  { $gt: ["$$batch.expiryDate", null] },  // has expiryDate
                  { $gt: ["$$batch.boxes", 0] }            // stock > 0
                ]
              }
            }
          }
        }
      },
      // Step 2: Calculate boxes * lc for each expiry batch, then sum
      {
        $addFields: {
          totalExpiryStockAmount: {
            $sum: {
              $map: {
                input: "$expiryBatches",
                as: "batch",
                in: { $multiply: ["$$batch.boxes", "$$batch.lc"] }
              }
            }
          },
          totalExpiryBoxes: {
            $sum: "$expiryBatches.boxes"
          }
        }
      },
      // Step 3: Only show products that have expiry stock
      {
        $match: {
          totalExpiryStockAmount: { $gt: 0 }
        }
      },
      // Step 4: Sort by highest expiry stock amount
      {
        $sort: { totalExpiryStockAmount: -1 }
      },
      // Step 5: Return only needed fields
      {
        $project: {
          _id: 1,
          productName: 1,
          supplierName: 1,
          type: 1,
          status: 1,
          totalExpiryBoxes: 1,
          totalExpiryStockAmount: { $round: ["$totalExpiryStockAmount", 2] }
        }
      }
    ]).toArray();

    // Grand total across all products
    const grandTotal = expiryStockResult.reduce(
      (sum, p) => sum + p.totalExpiryStockAmount, 0
    );
    const grandTotalBoxes = expiryStockResult.reduce(
      (sum, p) => sum + p.totalExpiryBoxes, 0
    );

    console.log("=".repeat(90));
    console.log("📦 EXPIRY STOCK REPORT — (boxes × lc) per Product");
    console.log("=".repeat(90));
    console.log(
      "Rank | Product Name                    | Supplier                  | Boxes     | Amount"
    );
    console.log("-".repeat(90));

    let rank = 1;
    expiryStockResult.forEach((p) => {
      const name = (p.productName || "Unknown").substring(0, 30).padEnd(30);
      const supplier = (p.supplierName || "Unknown").substring(0, 24).padEnd(24);
      console.log(
        `${rank.toString().padStart(2)}   | ${name}  | ${supplier}  | ${p.totalExpiryBoxes.toString().padStart(8)} | $${p.totalExpiryStockAmount.toFixed(2).padStart(10)}`
      );
      rank++;
    });

    console.log("-".repeat(90));
    console.log(
      `${"GRAND TOTAL".padStart(2).padEnd(60)}  | ${grandTotalBoxes.toString().padStart(8)} | $${grandTotal.toFixed(2).padStart(10)}`
    );
    console.log("=".repeat(90));
    console.log(`\n✅ Total Products with Expiry Stock: ${expiryStockResult.length}`);
    console.log(`📦 Total Expiry Boxes: ${grandTotalBoxes.toLocaleString()}`);
    console.log(`💰 Grand Total Expiry Amount (boxes × lc): $${grandTotal.toFixed(2)}`);
    console.log("=".repeat(90));

  } finally {
    await client.close();
  }
}

run().catch(console.dir);