import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb+srv://admin:ni6tP5N63U0Yxvdr@cluster0.2qjjhh8.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0';

const saleSummarySchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  totalAmount: Number,
  mrName: String,
  mrId: String,
  invoiceNumber: String,
  invoiceDate: Date,
  recordingDate: Date,
  customerName: String,
  createdAt: Date
}, { collection: 'salesummaries' });

const SaleSummary = mongoose.model('SaleSummary', saleSummarySchema);

async function findMissingInvoicesForMsKimmouy() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB - Database: test\n');

    // March 2026 range
    const startOfMarch = new Date('2026-03-01T00:00:00.000Z');
    const endOfMarch = new Date('2026-03-31T23:59:59.999Z');

    // Target MR
    const targetMR = 'Ms Kimmouy';
    const expectedTotal = 786.10;

    console.log(`🔍 Analyzing invoices for ${targetMR} in March 2026...\n`);
    console.log(`Expected Total: $${expectedTotal.toFixed(2)}\n`);
    console.log('=' .repeat(80));

    // Find all invoices for Ms Kimmouy
    const invoices = await SaleSummary.find({
      mrName: targetMR,
      invoiceDate: {
        $gte: startOfMarch,
        $lte: endOfMarch
      }
    }).lean();

    if (invoices.length === 0) {
      console.log(`❌ No invoices found for ${targetMR}`);
      return;
    }

    // Calculate actual total from found invoices
    const actualTotal = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    const difference = expectedTotal - actualTotal;

    console.log(`📊 INVOICE SUMMARY FOR ${targetMR}:`);
    console.log(`   📄 Total Invoices Found: ${invoices.length}`);
    console.log(`   💰 Actual Total from DB: $${actualTotal.toFixed(2)}`);
    console.log(`   🎯 Expected Total: $${expectedTotal.toFixed(2)}`);
    console.log(`   ⚠️  Difference: $${difference.toFixed(2)}`);
    console.log('=' .repeat(80));

    // Display all invoices found
    console.log('\n📋 ALL INVOICES FOUND IN DATABASE:');
    console.log('-'.repeat(80));
    
    let runningTotal = 0;
    invoices.forEach((inv, index) => {
      runningTotal += inv.totalAmount;
      console.log(`${index + 1}. Invoice #: ${inv.invoiceNumber || 'N/A'}`);
      console.log(`   Amount: $${inv.totalAmount.toFixed(2)}`);
      console.log(`   Date: ${inv.invoiceDate?.toISOString().split('T')[0]}`);
      console.log(`   Customer: ${inv.customerName || 'N/A'}`);
      console.log(`   Running Total: $${runningTotal.toFixed(2)}`);
      console.log('   ' + '-'.repeat(40));
    });

    if (difference > 0) {
      console.log(`\n⚠️  MISSING INVOICES DETECTED!`);
      console.log(`   Missing Amount: $${difference.toFixed(2)}`);
      
      // Check if there are invoices outside March range
      const outsideMarch = await SaleSummary.find({
        mrName: targetMR,
        invoiceDate: {
          $lt: startOfMarch
        }
      }).select('invoiceNumber totalAmount invoiceDate').lean();
      
      if (outsideMarch.length > 0) {
        console.log(`\n📅 Invoices before March 2026:`);
        outsideMarch.forEach(inv => {
          console.log(`   - Invoice ${inv.invoiceNumber}: $${inv.totalAmount} on ${inv.invoiceDate?.toISOString().split('T')[0]}`);
        });
      }
      
      const afterMarch = await SaleSummary.find({
        mrName: targetMR,
        invoiceDate: {
          $gt: endOfMarch
        }
      }).select('invoiceNumber totalAmount invoiceDate').lean();
      
      if (afterMarch.length > 0) {
        console.log(`\n📅 Invoices after March 2026:`);
        afterMarch.forEach(inv => {
          console.log(`   - Invoice ${inv.invoiceNumber}: $${inv.totalAmount} on ${inv.invoiceDate?.toISOString().split('T')[0]}`);
        });
      }
    }

    return { invoices, actualTotal, difference };

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Function to compare expected vs actual with detailed breakdown
async function auditMsKimmouyInvoices() {
  try {
    await mongoose.connect(MONGODB_URI);
    
    const startOfMarch = new Date('2026-03-01T00:00:00.000Z');
    const endOfMarch = new Date('2026-03-31T23:59:59.999Z');
    const targetMR = 'Ms Kimmouy';
    const expectedTotal = 786.10;

    // Get all invoices with full details
    const allInvoices = await SaleSummary.aggregate([
      {
        $match: {
          mrName: targetMR,
          invoiceDate: { $gte: startOfMarch, $lte: endOfMarch }
        }
      },
      {
        $project: {
          invoiceNumber: 1,
          totalAmount: 1,
          invoiceDate: 1,
          customerName: 1,
          recordingDate: 1,
          createdAt: 1
        }
      },
      {
        $sort: { invoiceDate: 1 }
      }
    ]);

    const actualTotal = allInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const difference = expectedTotal - actualTotal;

    console.log('\n🔍 AUDIT REPORT FOR MS KIMMOUY - MARCH 2026');
    console.log('=' .repeat(80));
    console.log(`Expected Total: $${expectedTotal.toFixed(2)}`);
    console.log(`Actual Total in DB: $${actualTotal.toFixed(2)}`);
    console.log(`Difference: $${difference.toFixed(2)}`);
    console.log('=' .repeat(80));

    if (Math.abs(difference) < 0.01) {
      console.log('✅ All invoices match! No missing invoices.');
    } else {
      console.log(`\n⚠️  MISSING AMOUNT: $${difference.toFixed(2)}`);
      
      // Try to find invoices that might have different MR name spelling
      const similarNames = await SaleSummary.aggregate([
        {
          $match: {
            mrName: { $regex: /Kimmouy/i },
            invoiceDate: { $gte: startOfMarch, $lte: endOfMarch }
          }
        },
        {
          $group: {
            _id: '$mrName',
            count: { $sum: 1 },
            total: { $sum: '$totalAmount' }
          }
        }
      ]);
      
      if (similarNames.length > 1) {
        console.log('\n📌 Found similar MR names that might be misspelled:');
        similarNames.forEach(name => {
          if (name._id !== targetMR) {
            console.log(`   - "${name._id}": $${name.total.toFixed(2)} (${name.count} invoices)`);
          }
        });
      }
      
      // Display all invoices found
      console.log('\n📋 INVOICES FOUND IN DATABASE:');
      console.log('-'.repeat(80));
      allInvoices.forEach((inv, i) => {
        console.log(`${i+1}. Invoice: ${inv.invoiceNumber || 'N/A'} | Amount: $${inv.totalAmount} | Date: ${inv.invoiceDate?.toISOString().split('T')[0]} | Customer: ${inv.customerName || 'N/A'}`);
      });
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Function to check for specific invoice amounts
async function findSpecificAmounts() {
  try {
    await mongoose.connect(MONGODB_URI);
    
    const targetMR = 'Ms Kimmouy';
    const amounts = [786.10, 129, 250, 100]; // Add expected amounts to check
    
    console.log('\n🔍 Searching for specific invoice amounts...\n');
    
    for (const amount of amounts) {
      const invoices = await SaleSummary.find({
        mrName: targetMR,
        totalAmount: amount
      }).select('invoiceNumber totalAmount invoiceDate customerName').lean();
      
      if (invoices.length > 0) {
        console.log(`✅ Found $${amount}:`);
        invoices.forEach(inv => {
          console.log(`   - Invoice ${inv.invoiceNumber}: $${inv.totalAmount} on ${inv.invoiceDate?.toISOString().split('T')[0]}`);
        });
      } else {
        console.log(`❌ No invoice found for amount $${amount}`);
      }
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run all audit functions
async function runFullAudit() {
  await findMissingInvoicesForMsKimmouy();
  console.log('\n' + '='.repeat(80) + '\n');
  await auditMsKimmouyInvoices();
  console.log('\n' + '='.repeat(80) + '\n');
  await findSpecificAmounts();
}

// Run the main audit
runFullAudit().catch(console.error);

// Or run individual functions:
// findMissingInvoicesForMsKimmouy().catch(console.error);
// auditMsKimmouyInvoices().catch(console.error);
// findSpecificAmounts().catch(console.error);