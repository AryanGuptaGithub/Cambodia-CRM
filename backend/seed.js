import { MongoClient, ObjectId } from 'mongodb';

const uri = "mongodb+srv://admin:ni6tP5N63U0Yxvdr@cluster0.2qjjhh8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);

const COLLECTION = "dailysamplereports";

async function updateProductsArray() {
  try {
    await client.connect();
    const db = client.db("test");
    const col = db.collection(COLLECTION);

    const targetId = new ObjectId("69d0aa2b2d880e320cb92256");

    const result = await col.updateOne(
      { _id: targetId },
      {
        $set: {
          "products.0.productName": "Hyalukam",
          "products.0.totalQty": 2,
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      console.log(`❌ Document not found`);
    } else if (result.modifiedCount > 0) {
      console.log(`✅ Successfully updated products array`);
      
      const updatedDoc = await col.findOne({ _id: targetId });
      console.log(`\n📄 Updated document:`);
      console.log(`   products[0].productName: ${updatedDoc.products[0].productName}`);
      console.log(`   products[0].totalQty: ${updatedDoc.products[0].totalQty}`);
    } else {
      console.log(`⚠️ No changes made`);
    }

  } catch (error) {
    console.error("❌ Update failed:", error);
  } finally {
    await client.close();
  }
}

updateProductsArray();