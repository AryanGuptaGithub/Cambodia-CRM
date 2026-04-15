{/* ── View Modal ────────────────────────────────────────────────────────── */}
{isViewModalOpen &&
  ReactDOM.createPortal(
    <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50 px-4 py-5">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeViewModal}
      />
      <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
        <button
          onClick={closeViewModal}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          <X size={20} />
        </button>
        <h2
          className={`${isMobileView ? "text-base" : "text-xl"} font-semibold text-gray-800 mb-4`}
        >
          View{" "}
          {activeTab === "general" ? "Stock Transfer" : "MR Transfer"}
        </h2>
        {activeTab === "mr" &&
          isReceiveType(form.transferType) &&
          mrStockLoading && (
            <div className="text-center text-gray-500 py-2">
              Loading MR stock details...
            </div>
          )}
        {activeTab === "mr" && (currentMRInfo || form.mrName) && (
          <div className="mb-4 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
              <User size={18} />
            </div>
            <div>
              <p className="font-bold text-blue-900">
                {currentMRInfo?.mrName ||
                  form.stockTransferToMr ||
                  form.mrName}
              </p>
            </div>
            <span className="ml-auto text-xs bg-blue-600 text-white px-2 py-1 rounded-full capitalize">
              {isReceiveType(form.transferType) ? "Receive" : "Send"}
            </span>
          </div>
        )}
        
        {/* Mobile View - Custom Layout */}
        {isMobileView ? (
          <div className="max-h-[65vh] overflow-y-auto">
            {/* Row 1: Stock Transfer No and Date */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[10px] font-medium text-gray-600">
                  Stock Transfer No
                </label>
                <p className="border px-2 py-1.5 rounded-lg bg-gray-100 font-medium text-indigo-600 text-[10px]">
                  {form.invoiceNo || "-"}
                </p>
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-600">
                  Date
                </label>
                <p className="border px-2 py-1.5 rounded-lg bg-gray-100 text-[10px]">
                  {form.date ? formatDateToReadable(form.date) : "-"}
                </p>
              </div>
            </div>

            {/* Row 2: Transfer Type and MR Name (or Source/Destination) */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              {activeTab === "general" ? (
                <>
                  <div>
                    <label className="text-[10px] font-medium text-gray-600">
                      Transfer Type
                    </label>
                    <p className="border px-2 py-1.5 rounded-lg bg-gray-100 capitalize text-[10px]">
                      {form.transferType || "-"}
                    </p>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-600">
                      {form.transferType === "send" ? "Destination" : "Source"}
                    </label>
                    <p className="border px-2 py-1.5 rounded-lg bg-gray-100 capitalize text-[10px]">
                      {form.transferType === "send"
                        ? form.destination || "-"
                        : form.source || "-"}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-[10px] font-medium text-gray-600">
                      Transfer Type
                    </label>
                    <p className="border px-2 py-1.5 rounded-lg bg-gray-100 capitalize text-[10px]">
                      {isReceiveType(form.transferType) ? "Receive" : "Send"}
                    </p>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-600">
                      MR Name
                    </label>
                    <p className="border px-2 py-1.5 rounded-lg bg-gray-100 text-[10px]">
                      {currentMRInfo?.mrName ||
                        form.stockTransferToMr ||
                        form.stockTransferFromMrToMain ||
                        form.mrName ||
                        "-"}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Row 3: Remarks */}
            <div className="mb-4">
              <label className="text-[10px] font-medium text-gray-600">
                Remarks
              </label>
              <p className="border px-2 py-1.5 rounded-lg bg-gray-100 capitalize text-[10px]">
                {form.remarks || "-"}
              </p>
            </div>

            {/* ── View: MR Receive type — show stockInMRHand table ─────────── */}
            {activeTab === "mr" && isReceiveType(form.transferType) ? (
              <div>
                <h3 className="text-sm font-medium text-gray-800 mb-2">
                  Stock In MR Hand (qty &gt; 0)
                </h3>
                {mrStockLoading ? (
                  <div className="text-center py-3 text-gray-500 animate-pulse text-[10px]">
                    Loading MR stock...
                  </div>
                ) : mrStockData.length === 0 ? (
                  <div className="text-center py-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-500">
                    <Package size={24} className="mx-auto mb-1 text-gray-300" />
                    <p className="text-[10px]">No stock with quantity &gt; 0 found for this MR.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-lg mb-4">
                    <table className="w-full">
                      <thead className="bg-blue-50 text-blue-800">
                        <tr>
                          <th className="px-2 py-1 text-[9px] text-left font-semibold">Product Name</th>
                          <th className="px-2 py-1 text-[9px] text-center font-semibold">Assigned Qty</th>
                          <th className="px-2 py-1 text-[9px] text-center font-semibold">In Hand</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mrStockData.map((p, idx) => (
                          <tr key={p.productId || idx} className={`border-t ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                            <td className="px-2 py-1 text-[9px] font-medium text-gray-800">
                              {p.productName}
                            </td>
                            <td className="px-2 py-1 text-[9px] text-center">
                              <span className="inline-flex items-center justify-center bg-purple-100 text-purple-700 text-[8px] font-semibold px-1.5 py-0.5 rounded-full">
                                {p.assignedQuantity || 0}
                              </span>
                            </td>
                            <td className="px-2 py-1 text-[9px] text-center">
                              <span className="inline-flex items-center justify-center bg-green-100 text-green-700 text-[8px] font-semibold px-1.5 py-0.5 rounded-full">
                                {p.quantity || 0}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <h3 className="text-sm font-medium text-gray-800 mt-3 mb-2">
                  Returned Products ({form.items?.length || 0})
                </h3>
                
                {/* Mobile Table format for Returned Products */}
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full min-w-[450px]">
                    <thead className="bg-blue-50 text-blue-800">
                      <tr>
                        <th className="px-2 py-1 text-[9px] text-left font-semibold">Product</th>
                        <th className="px-2 py-1 text-[9px] text-center font-semibold">Qty</th>
                        <th className="px-2 py-1 text-[9px] text-center font-semibold">Price</th>
                        <th className="px-2 py-1 text-[9px] text-center font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.items && form.items.length > 0 ? (
                        form.items.map((item, index) => {
                          const productCost = (item.sellingPrice || 0) * (item.boxQuantity || 0);
                          return (
                            <tr key={item._id || index} className={`border-t ${index % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                              <td className="px-2 py-2 text-[9px] font-medium text-gray-800">
                                {item.productName || "-"}
                              </td>
                              <td className="px-2 py-2 text-[9px] text-center">
                                <span className="inline-flex items-center justify-center bg-purple-100 text-purple-700 text-[8px] font-semibold px-1.5 py-0.5 rounded-full">
                                  {item.boxQuantity || 0}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-[9px] text-center">
                                <span className="text-green-600 font-medium">
                                  ${formatCurrency(item.sellingPrice)}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-[9px] text-center">
                                <span className="text-green-700 font-semibold">
                                  ${formatCurrency(productCost)}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-gray-500 text-[9px]">
                            No items
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* ── View: non-receive — normal items list ───────────────────── */
              <div>
                <h3 className="text-sm font-medium text-gray-800 mb-2">
                  Products ({form.items?.length || 0})
                </h3>
                
                {/* Mobile Table format for Products */}
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full min-w-[450px]">
                    <thead className="bg-gray-100 text-gray-700">
                      <tr>
                        <th className="px-2 py-1 text-[9px] text-left font-semibold">Product</th>
                        <th className="px-2 py-1 text-[9px] text-center font-semibold">Qty</th>
                        <th className="px-2 py-1 text-[9px] text-center font-semibold">Price</th>
                        <th className="px-2 py-1 text-[9px] text-center font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.items && form.items.length > 0 ? (
                        form.items.map((item, index) => {
                          const productCost = (item.sellingPrice || 0) * (item.boxQuantity || 0);
                          return (
                            <tr key={item._id || index} className={`border-t ${index % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                              <td className="px-2 py-2 text-[9px] font-medium text-gray-800">
                                {item.productName || "-"}
                              </td>
                              <td className="px-2 py-2 text-[9px] text-center">
                                <span className="inline-flex items-center justify-center bg-purple-100 text-purple-700 text-[8px] font-semibold px-1.5 py-0.5 rounded-full">
                                  {item.boxQuantity || 0}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-[9px] text-center">
                                <span className="text-green-600 font-medium">
                                  ${formatCurrency(item.sellingPrice)}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-[9px] text-center">
                                <span className="text-green-700 font-semibold">
                                  ${formatCurrency(productCost)}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-gray-500 text-[9px]">
                            No items
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* DESKTOP VIEW - Original Layout (unchanged) */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[65vh] overflow-y-auto">
            <div>
              <label
                className={`${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-600`}
              >
                Stock Transfer No
              </label>
              <p
                className={`border px-3 py-2 rounded-lg bg-gray-100 font-medium text-indigo-600 ${isMobileView ? "text-xs" : ""}`}
              >
                {form.invoiceNo || "-"}
              </p>
            </div>
            <div>
              <label
                className={`${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-600`}
              >
                Date
              </label>
              <p
                className={`border px-3 py-2 rounded-lg bg-gray-100 ${isMobileView ? "text-xs" : ""}`}
              >
                {form.date ? formatDateToReadable(form.date) : "-"}
              </p>
            </div>
            {activeTab === "general" ? (
              <>
                <div>
                  <label
                    className={`${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-600`}
                  >
                    Transfer Type
                  </label>
                  <p
                    className={`border px-3 py-2 rounded-lg bg-gray-100 capitalize ${isMobileView ? "text-xs" : ""}`}
                  >
                    {form.transferType || "-"}
                  </p>
                </div>
                <div>
                  <label
                    className={`${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-600`}
                  >
                    {form.transferType === "send"
                      ? "Destination"
                      : "Source"}
                  </label>
                  <p
                    className={`border px-3 py-2 rounded-lg bg-gray-100 capitalize ${isMobileView ? "text-xs" : ""}`}
                  >
                    {form.transferType === "send"
                      ? form.destination || "-"
                      : form.source || "-"}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label
                    className={`${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-600`}
                  >
                    Transfer Type
                  </label>
                  <p
                    className={`border px-3 py-2 rounded-lg bg-gray-100 capitalize ${isMobileView ? "text-xs" : ""}`}
                  >
                    {isReceiveType(form.transferType) ? "Receive" : "Send"}
                  </p>
                </div>
                <div>
                  <label
                    className={`${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-600`}
                  >
                    MR Name
                  </label>
                  <p
                    className={`border px-3 py-2 rounded-lg bg-gray-100 ${isMobileView ? "text-xs" : ""}`}
                  >
                    {currentMRInfo?.mrName ||
                      form.stockTransferToMr ||
                      form.stockTransferFromMrToMain ||
                      form.mrName ||
                      "-"}
                  </p>
                </div>
              </>
            )}
            <div className="md:col-span-2">
              <label
                className={`${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-600`}
              >
                Remarks
              </label>
              <p
                className={`border px-3 py-2 rounded-lg bg-gray-100 capitalize ${isMobileView ? "text-xs" : ""}`}
              >
                {form.remarks || "-"}
              </p>
            </div>

            {/* ── View: MR Receive type — show stockInMRHand table ─────────── */}
            {activeTab === "mr" && isReceiveType(form.transferType) ? (
              <div className="md:col-span-2">
                <h3
                  className={`${isMobileView ? "text-sm" : "text-lg"} font-medium text-gray-800 mb-3`}
                >
                  Stock In MR Hand (qty &gt; 0)
                </h3>
                {mrStockLoading ? (
                  <div className="text-center py-4 text-gray-500 animate-pulse">
                    Loading MR stock...
                  </div>
                ) : mrStockData.length === 0 ? (
                  <div className="text-center py-6 border-2 border-dashed border-gray-300 rounded-lg text-gray-500">
                    <Package
                      size={32}
                      className="mx-auto mb-2 text-gray-300"
                    />
                    No stock with quantity &gt; 0 found for this MR.
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full">
                      <thead className="bg-blue-50 text-blue-800">
                        <tr>
                          <th
                            className={`${isMobileView ? "px-2 py-1 text-[10px]" : "px-4 py-2"} text-left font-semibold`}
                          >
                            Product Name
                          </th>
                          <th
                            className={`${isMobileView ? "px-2 py-1 text-[10px]" : "px-4 py-2"} text-center font-semibold`}
                          >
                            Assigned Qty
                          </th>
                          <th
                            className={`${isMobileView ? "px-2 py-1 text-[10px]" : "px-4 py-2"} text-center font-semibold`}
                          >
                            Quantity (in hand)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {mrStockData.map((p, idx) => (
                          <tr
                            key={p.productId || idx}
                            className={`border-t ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                          >
                            <td
                              className={`${isMobileView ? "px-2 py-1 text-[10px]" : "px-4 py-2"} font-medium text-gray-800`}
                            >
                              {p.productName}
                            </td>
                            <td
                              className={`${isMobileView ? "px-2 py-1 text-[10px]" : "px-4 py-2"} text-center`}
                            >
                              <span className="inline-flex items-center justify-center bg-purple-100 text-purple-700 text-[10px] font-semibold px-2 py-1 rounded-full">
                                {p.assignedQuantity || 0}
                              </span>
                            </td>
                            <td
                              className={`${isMobileView ? "px-2 py-1 text-[10px]" : "px-4 py-2"} text-center`}
                            >
                              <span className="inline-flex items-center justify-center bg-green-100 text-green-700 text-[10px] font-semibold px-2 py-1 rounded-full">
                                {p.quantity || 0}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <h3
                  className={`${isMobileView ? "text-sm" : "text-lg"} font-medium text-gray-800 mt-5 mb-3`}
                >
                  Returned Products ({form.items?.length || 0})
                </h3>
                
                {/* Desktop Card format for Returned Products */}
                <div className="space-y-4 max-h-60 overflow-y-auto border rounded-lg p-4">
                  {form.items && form.items.length > 0 ? (
                    form.items.map((item, index) => {
                      const productCost =
                        (item.sellingPrice || 0) * (item.boxQuantity || 0);
                      return (
                        <div
                          key={item._id || index}
                          className="border-b pb-4 last:border-b-0 bg-blue-50 p-3 rounded-lg"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                              <label
                                className={`${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-600`}
                              >
                                Product Name
                              </label>
                              <p
                                className={`px-3 py-2 rounded bg-white ${isMobileView ? "text-xs" : ""}`}
                              >
                                {item.productName || "-"}
                              </p>
                            </div>
                            <div>
                              <label
                                className={`${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-600`}
                              >
                                Returned Qty
                              </label>
                              <p
                                className={`px-3 py-2 rounded bg-white flex items-center gap-1 ${isMobileView ? "text-xs" : ""}`}
                              >
                                <Box
                                  size={isMobileView ? 12 : 14}
                                  className="text-gray-500"
                                />
                                {item.boxQuantity || 0}
                              </p>
                            </div>
                            <div>
                              <label
                                className={`${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-600`}
                              >
                                Selling Price ($)
                              </label>
                              <p
                                className={`px-3 py-2 rounded bg-white flex items-center gap-1 ${isMobileView ? "text-xs" : ""}`}
                              >
                                <DollarSign
                                  size={isMobileView ? 12 : 14}
                                  className="text-green-600"
                                />
                                {formatCurrency(item.sellingPrice)}
                              </p>
                            </div>
                            <div>
                              <label
                                className={`${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-600`}
                              >
                                Total Selling Price ($)
                              </label>
                              <p
                                className={`px-3 py-2 rounded bg-white font-medium text-green-700 ${isMobileView ? "text-xs" : ""}`}
                              >
                                ${formatCurrency(productCost)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-gray-500 text-center">No items</p>
                  )}
                </div>
              </div>
            ) : (
              /* ── View: non-receive — normal items list ───────────────────── */
              <div className="md:col-span-2">
                <h3
                  className={`${isMobileView ? "text-sm" : "text-lg"} font-medium text-gray-800 mb-3`}
                >
                  Products ({form.items?.length || 0})
                </h3>
                
                {/* Desktop Card format for Products */}
                <div className="space-y-4 max-h-60 overflow-y-auto border rounded-lg p-4">
                  {form.items && form.items.length > 0 ? (
                    form.items.map((item, index) => {
                      const productCost =
                        (item.sellingPrice || 0) * (item.boxQuantity || 0);
                      return (
                        <div
                          key={item._id || index}
                          className="border-b pb-4 last:border-b-0 bg-gray-50 p-3 rounded-lg"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                              <label
                                className={`${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-600`}
                              >
                                Product Name
                              </label>
                              <p
                                className={`px-3 py-2 rounded bg-white ${isMobileView ? "text-xs" : ""}`}
                              >
                                {item.productName || "-"}
                              </p>
                            </div>
                            <div>
                              <label
                                className={`${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-600`}
                              >
                                Box Quantity
                              </label>
                              <p
                                className={`px-3 py-2 rounded bg-white flex items-center gap-1 ${isMobileView ? "text-xs" : ""}`}
                              >
                                <Box
                                  size={isMobileView ? 12 : 14}
                                  className="text-gray-500"
                                />
                                {item.boxQuantity || 0}
                              </p>
                            </div>
                            <div>
                              <label
                                className={`${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-600`}
                              >
                                Selling Price ($)
                              </label>
                              <p
                                className={`px-3 py-2 rounded bg-white flex items-center gap-1 ${isMobileView ? "text-xs" : ""}`}
                              >
                                <DollarSign
                                  size={isMobileView ? 12 : 14}
                                  className="text-green-600"
                                />
                                {formatCurrency(item.sellingPrice)}
                              </p>
                            </div>
                            <div>
                              <label
                                className={`${isMobileView ? "text-[10px]" : "text-sm"} font-medium text-gray-600`}
                              >
                                Total Selling Price ($)
                              </label>
                              <p
                                className={`px-3 py-2 rounded bg-white font-medium text-green-700 ${isMobileView ? "text-xs" : ""}`}
                              >
                                ${formatCurrency(productCost)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-gray-500 text-center">No items</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        
        <div className="mt-6 flex justify-end">
          <button
            onClick={closeViewModal}
            className={`bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer ${isMobileView ? "text-xs" : ""}`}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )}