// utils/db.js
import mongoose from "mongoose";

mongoose.set('bufferTimeoutMS', 30000);  // 30 seconds buffer timeout

let isConnected = false;

/**
 * Connect to MongoDB if not already connected.
 * Returns the connection instance.
 */
async function connectDB(uri) {
  if (isConnected) {
    // Already connected
    return mongoose.connection;
  }

  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    isConnected = true;
    console.log("✅ MongoDB connected");
    return mongoose.connection;
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    throw err; // important to throw so caller can handle connection failure
  }
}

export default connectDB;

