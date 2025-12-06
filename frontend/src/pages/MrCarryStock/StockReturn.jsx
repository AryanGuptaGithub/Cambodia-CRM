import React, { useState, useEffect } from "react";
import { ArrowLeft, CheckCircle, XCircle, Package, Search } from "lucide-react";
import { toast } from "react-hot-toast";

const StockReturn = () => {
  const [mrList, setMrList] = useState([]);
  const [selectedMr, setSelectedMr] = useState("");
  const [mrStock, setMrStock] = useState([]);
  const [returnItems, setReturnItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    fetchMrList();
  }, []);

  useEffect(() => {
    if (selectedMr) {
      fetchMrStock(selectedMr);
    }
  }, [selectedMr]);

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

  const fetchMrStock = async (mrCode) => {
    try {
      setLoading(true);
      // Mock data based on selected MR
      const mockStock = [
        { 
          id: 1, 
          productCode: "PROD001", 
          productName: "Paracetamol 500mg", 
          batch: "BATCH001", 
          expiry: "2024-12-31", 
          assignedQty: 50, 
          remainingQty: 30 
        },
        { 
          id: 2, 
          productCode: "PROD002", 
          productName: "Amoxicillin 250mg", 
          batch: "BATCH002", 
          expiry: "2024-11-30", 
          assignedQty: 20, 
          remainingQty: 5 
        },
      ];
      setMrStock(mockStock);
      setReturnItems([]); // Reset return items when MR changes
    } catch (error) {
      console.error("Error fetching MR stock:", error);
      toast.error("Failed to load MR stock");
    } finally {
      setLoading(false);
    }
  };

  const handleAddReturnItem = (stockItem) => {
    // Check if already in return items
    const existingIndex = returnItems.findIndex(item => item.id === stockItem.id);
    if (existingIndex >= 0) {
      toast.error("Item already in return list");
      return;
    }
    
    setReturnItems([...returnItems, { ...stockItem, returnQty: 1, reason: "" }]);
  };

  const handleRemoveReturnItem = (index) => {
    const updatedItems = [...returnItems];
    updatedItems.splice(index, 1);
    setReturnItems(updatedItems);
  };

  const handleReturnQtyChange = (index, value) => {
    const updatedItems = [...returnItems];
    const maxQty = updatedItems[index].remainingQty;
    const qty = Math.min(parseInt(value) || 1, maxQty);
    updatedItems[index].returnQty = qty;
    setReturnItems(updatedItems);
  };

  const handleReasonChange = (index, value) => {
    const updatedItems = [...returnItems];
    updatedItems[index].reason = value;
    setReturnItems(updatedItems);
  };

  const handleSubmitReturn = () => {
    if (!selectedMr) {
      toast.error("Please select an MR");
      return;
    }
    
    if (returnItems.length === 0) {
      toast.error("Please add items to return");
      return;
    }
    
    // Validate quantities
    for (const item of returnItems) {
      if (item.returnQty > item.remainingQty) {
        toast.error(`Return quantity for ${item.productName} exceeds available quantity`);
        return;
      }
      if (!item.reason.trim()) {
        toast.error(`Please provide reason for returning ${item.productName}`);
        return;
      }
    }
    
    // Submit return logic here
    toast.success("Stock return submitted successfully!");
    setSelectedMr("");
    setReturnItems([]);
    setRemarks("");
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Stock Return</h1>
        <p className="text-gray-600">Process stock returns from MRs</p>
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
          {/* MR's Current Stock */}
          <div className="mb-6">
            <h2 className="text-lg font-medium text-gray-700 mb-4">
              Current Stock with {mrList.find(m => m.id === selectedMr)?.name}
            </h2>
            
            {loading ? (
              <div className="text-center py-4">Loading stock...</div>
            ) : mrStock.length === 0 ? (
              <div className="text-center py-4 text-gray-500 border rounded-lg">
                No stock assigned to this MR
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {mrStock.map((item) => (
                  <div key={item.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-medium text-gray-900">{item.productName}</h3>
                        <p className="text-sm text-gray-500">{item.productCode}</p>
                      </div>
                      <Package className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="text-sm text-gray-600 mb-3">
                      <div>Batch: {item.batch}</div>
                      <div>Expiry: {item.expiry}</div>
                      <div className="font-medium mt-1">
                        Available: {item.remainingQty} / {item.assignedQty}
                      </div>
                    </div>
                    <button
                      onClick={() => handleAddReturnItem(item)}
                      disabled={item.remainingQty <= 0}
                      className={`w-full py-1 rounded text-sm ${
                        item.remainingQty > 0 
                          ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' 
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {item.remainingQty > 0 ? 'Add to Return' : 'No Stock Available'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Return Items */}
          <div className="mb-6">
            <h2 className="text-lg font-medium text-gray-700 mb-4">Return Items</h2>
            
            {returnItems.length === 0 ? (
              <div className="text-center py-4 text-gray-500 border rounded-lg">
                No items added for return
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Available</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Return Qty</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {returnItems.map((item, index) => (
                      <tr key={index}>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">{item.productName}</div>
                          <div className="text-sm text-gray-500">{item.productCode}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{item.batch}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{item.remainingQty}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="1"
                            max={item.remainingQty}
                            value={item.returnQty}
                            onChange={(e) => handleReturnQtyChange(index, e.target.value)}
                            className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={item.reason}
                            onChange={(e) => handleReasonChange(index, e.target.value)}
                            placeholder="Enter reason..."
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleRemoveReturnItem(index)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setSelectedMr("");
                setReturnItems([]);
              }}
              className="bg-gray-200 text-gray-700 px-6 py-2 rounded-md hover:bg-gray-300 flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Cancel
            </button>
            <button
              onClick={handleSubmitReturn}
              disabled={returnItems.length === 0}
              className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Submit Return
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default StockReturn;