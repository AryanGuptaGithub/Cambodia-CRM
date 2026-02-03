// ==========================================
// MR CASH SYNC SCRIPT
// Run this ONCE to sync MR Cash from all existing sales
// ==========================================

import mongoose from "mongoose";
import SaleSummary from "../../models/sale/saleSummary.js";
import MRCash from "../../models/accounts/MRCash.js";
import Staff from "../../models/staffMember/staff.js";

const fixPrecision = (num) => {
  if (typeof num !== "number") return num;
  return Math.round(num * 100) / 100;
};

export const syncMRCashFromAllSales = async () => {
  try {
    console.log("🔄 Starting MR Cash synchronization from all sales...");
    
    // Get all sales grouped by MR with their paid amounts
    const salesByMR = await SaleSummary.aggregate([
      {
        $match: {
          mrName: { $exists: true, $ne: null, $ne: "" },
          paidAmount: { $gt: 0 }, // Only count sales with paid amount
        },
      },
      {
        $group: {
          _id: "$mrName",
          totalPaidAmount: { $sum: "$paidAmount" },
          invoiceCount: { $sum: 1 },
          firstInvoice: { $first: "$invoiceNumber" },
          lastInvoice: { $last: "$invoiceNumber" },
        },
      },
      {
        $sort: { totalPaidAmount: -1 },
      },
    ]);
    
    console.log(`📊 Found ${salesByMR.length} MRs with sales data\n`);
    console.log("=".repeat(80));
    
    const results = [];
    let totalSyncedCash = 0;
    
    for (const mrData of salesByMR) {
      const session = await mongoose.startSession();
      session.startTransaction();
      
      try {
        const mrName = mrData._id;
        const totalCash = fixPrecision(mrData.totalPaidAmount);
        
        // Find MR staff record
        const mr = await Staff.findOne({
          medicalRepName: { $regex: `^${mrName.trim()}$`, $options: "i" },
        }).session(session);
        
        if (!mr) {
          console.warn(`⚠️  MR not found in Staff: ${mrName}`);
          await session.abortTransaction();
          session.endSession();
          results.push({
            mrName,
            success: false,
            error: "MR not found in Staff collection",
          });
          continue;
        }
        
        // Find or create MRCash record
        let mrCash = await MRCash.findOne({ mrId: mr._id }).session(session);
        
        const oldCash = mrCash?.currentCash || 0;
        const isNew = !mrCash;
        
        if (!mrCash) {
          mrCash = new MRCash({
            mrId: mr._id,
            mrName: mr.medicalRepName,
            currentCash: totalCash,
            cashTransferredToAdmin: 0,
            lastTransferDate: null,
            notes: `Synced from ${mrData.invoiceCount} sales (${mrData.firstInvoice} to ${mrData.lastInvoice})`,
            isActive: true,
          });
        } else {
          // Update existing record
          mrCash.currentCash = totalCash;
          mrCash.notes = `Re-synced from ${mrData.invoiceCount} sales. Previous: ${oldCash}, New: ${totalCash}`;
          mrCash.updatedAt = new Date();
        }
        
        await mrCash.save({ session });
        
        await session.commitTransaction();
        session.endSession();
        
        results.push({
          mrName: mr.medicalRepName,
          success: true,
          totalCash,
          oldCash,
          difference: fixPrecision(totalCash - oldCash),
          invoiceCount: mrData.invoiceCount,
          action: isNew ? "created" : "updated",
        });
        
        totalSyncedCash = fixPrecision(totalSyncedCash + totalCash);
        
        // Print detailed log
        const action = isNew ? "CREATED" : "UPDATED";
        const changeInfo = isNew
          ? `${totalCash}`
          : `${oldCash} → ${totalCash} (${totalCash > oldCash ? "+" : ""}${fixPrecision(totalCash - oldCash)})`;
        
        console.log(
          `✅ ${action.padEnd(8)} | ${mr.medicalRepName.padEnd(30)} | $${changeInfo.padStart(15)} | ${mrData.invoiceCount} invoices`
        );
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        
        results.push({
          mrName: mrData._id,
          success: false,
          error: error.message,
        });
        
        console.error(`❌ ERROR    | ${mrData._id.padEnd(30)} | ${error.message}`);
      }
    }
    
    console.log("=".repeat(80));
    
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    const createdCount = results.filter((r) => r.action === "created").length;
    const updatedCount = results.filter((r) => r.action === "updated").length;
    
    console.log(`\n📊 SYNC SUMMARY:`);
    console.log(`   Total MRs processed:  ${results.length}`);
    console.log(`   ✅ Succeeded:         ${successCount}`);
    console.log(`   ❌ Failed:            ${failCount}`);
    console.log(`   📝 Created:           ${createdCount}`);
    console.log(`   🔄 Updated:           ${updatedCount}`);
    console.log(`   💰 Total Cash Synced: $${totalSyncedCash.toFixed(2)}`);
    console.log("");
    
    return {
      success: true,
      message: "MR Cash synchronization completed",
      results,
      summary: {
        total: results.length,
        succeeded: successCount,
        failed: failCount,
        created: createdCount,
        updated: updatedCount,
        totalCashSynced: totalSyncedCash,
      },
    };
  } catch (error) {
    console.error("❌ CRITICAL ERROR in MR Cash sync:", error);
    return {
      success: false,
      message: "Failed to synchronize MR Cash",
      error: error.message,
    };
  }
};

// If running as standalone script
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Running MR Cash Sync as standalone script...\n");
  
  // Connect to MongoDB
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/your_database");
  
  // Run sync
  const result = await syncMRCashFromAllSales();
  
  if (result.success) {
    console.log("✅ Sync completed successfully");
    process.exit(0);
  } else {
    console.error("❌ Sync failed");
    process.exit(1);
  }
}