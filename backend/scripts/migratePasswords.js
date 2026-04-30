// backend/scripts/migratePasswords.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import dotenv from "dotenv/config";  // ← also change this import style

await mongoose.connect(process.env.MONGODB_URI);  // ← fix here

const users = await User.find({}).select("+password");
let migrated = 0;

for (const user of users) {
  if (user.password && user.password.startsWith("$2b$")) continue;

  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(user.password, salt);
  await User.updateOne({ _id: user._id }, { password: user.password });
  migrated++;
  console.log(`Migrated: ${user.email}`);
}

console.log(`\n✅ Done. Migrated ${migrated} users.`);
await mongoose.disconnect();