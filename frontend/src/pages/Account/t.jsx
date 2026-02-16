/* 
====================================================================
COMPLETE FIX FOR ALL 3 ISSUES
====================================================================
Issue 1: Customer Address not showing
Issue 2: Console.log not printing
Issue 3: Page refreshing when changing tabs
====================================================================
*/

// ============== FIX 1 & 2: Customer Address + Console.log ==============

// FIND the fetchSalesData function (around line 1260) and locate this specific part:

// FIND THIS (in the dropdown section):
setForm((prev) => ({
  ...prev,
  invoiceNumber: saleRecord.invoiceNumber || "",
  invoiceDate:
    saleRecord.invoiceDate?.split("T")[0] ||
    new Date().toISOString().split("T")[0],
  customerName:
    saleRecord.customerName || saleRecord.customer?.name || "",
  customerAddress:
    saleRecord.customerAddress ||
    saleRecord.customer?.address ||
    saleRecord.billingAddress ||
    saleRecord.shippingAddress ||
    saleRecord.address || // ✅ ADDED THIS LINE
    "",
  amount: saleRecord.totalAmount || saleRecord.amount || "",
}));

// REPLACE WITH (to add console.log debugging):
console.log("=== DEBUGGING CUSTOMER ADDRESS ===");
console.log("Full saleRecord:", saleRecord);
console.log("customerAddress:", saleRecord.customerAddress);
console.log("customer?.address:", saleRecord.customer?.address);
console.log("billingAddress:", saleRecord.billingAddress);
console.log("shippingAddress:", saleRecord.shippingAddress);
console.log("address:", saleRecord.address);

const finalAddress = saleRecord.customerAddress ||
  saleRecord.customer?.address ||
  saleRecord.billingAddress ||
  saleRecord.shippingAddress ||
  saleRecord.address ||
  "";

console.log("Final selected address:", finalAddress);
console.log("=== END DEBUG ===");

setForm((prev) => ({
  ...prev,
  invoiceNumber: saleRecord.invoiceNumber || "",
  invoiceDate:
    saleRecord.invoiceDate?.split("T")[0] ||
    new Date().toISOString().split("T")[0],
  customerName:
    saleRecord.customerName || saleRecord.customer?.name || "",
  customerAddress: finalAddress,
  amount: saleRecord.totalAmount || saleRecord.amount || "",
}));

// ALSO FIX IN THE API SECTION (around line 1360):

// FIND THIS:
setForm((prev) => ({
  ...prev,
  invoiceDate:
    saleRecord.invoiceDate?.split("T")[0] ||
    new Date().toISOString().split("T")[0],
  customerName:
    saleRecord.customerName || saleRecord.customer?.name || "",
  customerAddress:
    saleRecord.customerAddress ||
    saleRecord.customer?.address ||
    saleRecord.billingAddress ||
    saleRecord.shippingAddress ||
    "",
  amount: saleRecord.amount || saleRecord.totalAmount || "",
}));

// REPLACE WITH:
console.log("=== API DEBUGGING CUSTOMER ADDRESS ===");
console.log("Full API saleRecord:", saleRecord);
console.log("API customerAddress:", saleRecord.customerAddress);
console.log("API customer?.address:", saleRecord.customer?.address);
console.log("API billingAddress:", saleRecord.billingAddress);
console.log("API shippingAddress:", saleRecord.shippingAddress);
console.log("API address:", saleRecord.address);

const finalApiAddress = saleRecord.customerAddress ||
  saleRecord.customer?.address ||
  saleRecord.billingAddress ||
  saleRecord.shippingAddress ||
  saleRecord.address ||
  "";

console.log("Final API selected address:", finalApiAddress);
console.log("=== END API DEBUG ===");

setForm((prev) => ({
  ...prev,
  invoiceDate:
    saleRecord.invoiceDate?.split("T")[0] ||
    new Date().toISOString().split("T")[0],
  customerName:
    saleRecord.customerName || saleRecord.customer?.name || "",
  customerAddress: finalApiAddress,
  amount: saleRecord.amount || saleRecord.totalAmount || "",
}));


// ============== FIX 3: Stop Page Refresh on Tab Change ==============

// FIND the handleTabChange function (around line 2100):

const handleTabChange = (tab) => {
  setActiveTab(tab);
  setCurrentPage(1);
  setSearchTerm("");
  setSelected([]);
  refetchDropdownOptions();  // ❌ REMOVE THIS LINE - it causes refresh
};

// REPLACE WITH:

const handleTabChange = (tab) => {
  setActiveTab(tab);
  setCurrentPage(1);
  setSearchTerm("");
  setSelected([]);
  // ✅ REMOVED refetchDropdownOptions() - dropdown data doesn't change per tab
};


// ============== SUMMARY OF ALL CHANGES ==============

/*
CHANGE 1: In fetchSalesData (dropdown section) - Add console.log and finalAddress variable
CHANGE 2: In fetchSalesData (API section) - Add console.log and finalApiAddress variable  
CHANGE 3: In handleTabChange - Remove refetchDropdownOptions() call

After these changes:
✅ Customer Address will show (checks all possible field names)
✅ Console.log will print all data so you can see what's available
✅ Tab changes won't cause page refresh
*/
