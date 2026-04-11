import { MongoClient } from 'mongodb';

const uri = "mongodb+srv://admin:ni6tP5N63U0Yxvdr@cluster0.2qjjhh8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);

const COLLECTION = "dailysamplereports";

async function migrateInPlace() {
  try {
    await client.connect();
    const db = client.db("test");
    const col = db.collection(COLLECTION);

    const oldDocs = await col.find({}).toArray();
    console.log(`📄 Found ${oldDocs.length} documents.`);

    let updated = 0;
    for (const doc of oldDocs) {
      // Transform the document
      const update = {
        $set: {
          products: [
            {
              productName: doc.productName,
              totalQty: doc.totalQty,
            },
          ],
        },
        $unset: { productName: "", totalQty: "" } // remove old fields
      };
      await col.updateOne({ _id: doc._id }, update);
      updated++;
    }

    console.log(`✅ Updated ${updated} documents in "${COLLECTION}".`);
  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    await client.close();
  }
}

migrateInPlace();