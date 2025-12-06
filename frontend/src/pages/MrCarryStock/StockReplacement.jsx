import React, { useState, useEffect } from "react";
import { RefreshCw, Package, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "react-hot-toast";

const StockReplacement = () => {
  const [mrList, setMrList] = useState([]);
  const [selectedMr, setSelectedMr] = useState("");
  const [replacementItems, setReplacementItems] = useState([]);
  const [newItems, setNewItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    fetchMrList();
  }, []);

  const fetchMrList = async () => {
    try {
      // Mock data
      const mockData = [
        { id: "MR001", name: "John Doe" },
        { id: "MR002", name: "Jane Smith" },
        { id: "MR003", name: "Robert Johnson" },
      ];
      setMrList(mockData);
    } catch (error) {
      console.error("Error fetching MR list:", error);
    }
  };

  const handleAddReplacementItem = () => {
    const newItem = {
      id: Date.now(),
      oldProduct: "",
      oldBatch: "",
      oldQty: 1,
      newProduct: "",
      newBatch: "",
      newQty: 1,
      reason: ""
    };
    setReplacementItems([...replacementItems, newItem]);
  };

  const handleRemoveReplacementItem = (index) => {
    const updatedItems = [...replacementItems];
    updatedItems.splice(index, 1);
    setReplacementItems(updatedItems);
  };

  const handleItemChange = (index, field, value) => {
    const updatedItems = [...replacementItems];
    updatedItems[index][field] = value;
    setReplacementItems(updatedItems);
  };

  const handleAddNewItem = () => {
    const newItem = {
      id: Date.now(),
      product: "",
      batch: "",
      qty: 1,
      reason: ""
    };
    setNewItems([...newItems, newItem]);
  };

  const handleRemoveNewItem = (index) => {
    const updatedItems = [...newItems];
    updatedItems.splice(index, 1);
    setNewItems(updatedItems);
  };

  const handleNewItemChange = (index, field, value) => {
    const updatedItems = [...newItems];
    updatedItems[index][field] = value;
    setNewItems(updatedItems);
  };

  const handleSubmitReplacement = () => {
    if (!selectedMr) {
      toast.error("Please select an MR");
      return;
    }
    
    if (replacementItems.length === 0 && newItems.length === 0) {
      toast.error("Please add replacement or new items");
      return;
    }
    
    // Validate replacement items
    for (const item of replacementItems) {
      if (!item.oldProduct || !item.newProduct || !item.reason) {
        toast.error("Please fill all required fields for replacement items");
        return;
      }
    }
    
    // Validate new items
    for (const item of newItems) {
      if (!item.product || !item.reason) {
        toast.error("Please fill all required fields for new items");
        return;
      }
    }
    
    // Submit replacement logic here
    toast.success("Stock replacement submitted successfully!");
    setSelectedMr("");
    setReplacementItems([]);
    setNewItems([]);
    setRemarks("");
  };

  // Mock products for dropdown
  const products = [
    { id: "PROD001", name: "Paracetamol 500mg", batches: ["BATCH001", "BATCH002"] },
    { id: "PROD002", name: "Amoxicillin 250mg", batches: ["BATCH001"] },
    { id: "PROD003", name: "Vitamin C 100mg", batches: ["BATCH001", "BATCH003"] },
  ];

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Stock Replacement</h1>
        <p className="text-gray-600">Replace damaged/expired stock or add new stock</p>
      </div>

      {/* MR Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Medical Representative
        </label>
        <select
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={selectedMr}
          onChange={(e) => setSelectedMr(e.target.value)}
        >
          <option value="">Select MR</option>
          {mrList.map((mr) => (
            <option key={mr.id} value={mr.id}>
              {mr.id} - {mr.name}
            </option>
          ))}
        </select>
      </div>

      {selectedMr && (
        <>
          {/* Replacement Items */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium text-gray-700">Replacement Items</h2>
              <button
                onClick={handleAddReplacementItem}
                className="bg-blue-50 text-blue-700 px-4 py-2 rounded-md hover:bg-blue-100 flex items-center gap-2 text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Add Replacement
              </button>
            </div>
            
            {replacementItems.length === 0 ? (
              <div className="text-center py-4 text-gray-500 border rounded-lg">
                No replacement items added
              </div>
            ) : (
              <div className="space-y-4">
                {replacementItems.map((item, index) => (
                  <div key={item.id} className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-medium text-gray-700">Replacement #{index + 1}</h3>
                      <button
                        onClick={() => handleRemoveReplacementItem(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                      {/* Old Item */}
                      <div className="bg-white p-3 rounded border">
                        <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4 text-orange-500" />
                          Old Item (To be replaced)
                        </h4>
                        <div className="space-y-2">
                          <div>
                            <label className="text-xs text-gray-500">Product</label>
                            <select
                              value={item.oldProduct}
                              onChange={(e) => handleItemChange(index, 'oldProduct', e.target.value)}
                              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                            >
                              <option value="">Select Product</option>
                              {products.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Batch</label>
                            <input
                              type="text"
                              value={item.oldBatch}
                              onChange={(e) => handleItemChange(index, 'oldBatch', e.target.value)}
                              placeholder="Enter batch number"
                              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Quantity</label>
                            <input
                              type="number"
                              min="1"
                              value={item.oldQty}
                              onChange={(e) => handleItemChange(index, 'oldQty', e.target.value)}
                              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                      
                      {/* New Item */}
                      <div className="bg-white p-3 rounded border">
                        <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                          <Package className="w-4 h-4 text-green-500" />
                          New Item (Replacement)
                        </h4>
                        <div className="space-y-2">
                          <div>
                            <label className="text-xs text-gray-500">Product</label>
                            <select
                              value={item.newProduct}
                              onChange={(e) => handleItemChange(index, 'newProduct', e.target.value)}
                              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                            >
                              <option value="">Select Product</option>
                              {products.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Batch</label>
                            <input
                              type="text"
                              value={item.newBatch}
                              onChange={(e) => handleItemChange(index, 'newBatch', e.target.value)}
                              placeholder="Enter batch number"
                              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">Quantity</label>
                            <input
                              type="number"
                              min="1"
                              value={item.newQty}
                              onChange={(e) => handleItemChange(index, 'newQty', e.target.value)}
                              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-xs text-gray-500">Reason for Replacement</label>
                      <input
                        type="text"
                        value={item.reason}
                        onChange={(e) => handleItemChange(index, 'reason', e.target.value)}
                        placeholder="Enter reason (damaged, expired, etc.)"
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm mt-1"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* New Items (Additional Stock) */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium text-gray-700">Additional New Stock</h2>
              <button
                onClick={handleAddNewItem}
                className="bg-green-50 text-green-700 px-4 py-2 rounded-md hover:bg-green-100 flex items-center gap-2 text-sm"
              >
                <Package className="w-4 h-4" />
                Add New Item
              </button>
            </div>
            
            {newItems.length === 0 ? (
              <div className="text-center py-4 text-gray-500 border rounded-lg">
                No new items added
              </div>
            ) : (
              <div className="space-y-4">
                {newItems.map((item, index) => (
                  <div key={item.id} className="border rounded-lg p-4 bg-green-50">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-medium text-gray-700">New Item #{index + 1}</h3>
                      <button
                        onClick={() => handleRemoveNewItem(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs text-gray-500">Product</label>
                        <select
                          value={item.product}
                          onChange={(e) => handleNewItemChange(index, 'product', e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                        >
                          <option value="">Select Product</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Batch</label>
                        <input
                          type="text"
                          value={item.batch}
                          onChange={(e) => handleNewItemChange(index, 'batch', e.target.value)}
                          placeholder="Enter batch number"
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Quantity</label>
                        <input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(e) => handleNewItemChange(index, 'qty', e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                      </div>
                    </div>
                    
                    <div className="mt-3">
                      <label className="text-xs text-gray-500">Reason for Additional Stock</label>
                      <input
                        type="text"
                        value={item.reason}
                        onChange={(e) => handleNewItemChange(index, 'reason', e.target.value)}
                        placeholder="Enter reason"
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm mt-1"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Remarks */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Remarks (Optional)
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows="3"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Any additional notes..."
            />
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSubmitReplacement}
              disabled={replacementItems.length === 0 && newItems.length === 0}
              className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Submit Replacement
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default StockReplacement;