import React, { useState } from "react";
import { Plus, Trash2, Edit, Save, PlusCircle } from "lucide-react";
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  InputNumber,
} from "antd";

const { TextArea } = Input;
const { Option } = Select;

const mockAdjustments = [
  { id: 1, productName: "Product A", quantity: 10 },
  { id: 2, productName: "Product B", quantity: -5 },
  { id: 3, productName: "Product C", quantity: 20 },
];

const ITEMS_PER_PAGE = 5;

const StocjAdjustment = () => {
  const [adjustments, setAdjustments] = useState(mockAdjustments);
  const [selectedIds, setSelectedIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");

  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [quantity, setQuantity] = useState(1);

  const filteredAdjustments = adjustments.filter((adj) =>
    adj.productName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredAdjustments.length / ITEMS_PER_PAGE);

  const paginatedAdjustments = filteredAdjustments.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(paginatedAdjustments.map((adj) => adj.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleBulkDelete = () => {
    setAdjustments((prev) => prev.filter((adj) => !selectedIds.includes(adj.id)));
    setSelectedIds([]);
  };

  const handleModalSubmit = (values) => {
    const newAdjustment = {
      id: adjustments.length + 1,
      productName: values.product,
      quantity: values.quantity,
    };
    setAdjustments((prev) => [...prev, newAdjustment]);
    form.resetFields();
    setQuantity(1);
    setModalVisible(false);
  };

  return (
    <div className="max-w-8xl p-6 bg-white rounded-xl shadow">
      {/* Breadcrumb */}
      <div className="mb-4 text-gray-600 text-sm">
        Dashboard <span className="mx-2">{'>'}</span> Stock Adjustment
      </div>

      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div className="flex gap-3 flex-wrap">
          <button
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
            onClick={() => setModalVisible(true)}
          >
            <Plus size={18} /> Add New Adjustment
          </button>

          {selectedIds.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
            >
              <Trash2 size={18} /> Delete Selected ({selectedIds.length})
            </button>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-1/3">
          <input
            type="text"
            placeholder="Search product..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full border border-gray-300 rounded-md pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <svg
            className="absolute left-3 top-2.5 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            height="18"
            viewBox="0 0 24 24"
            width="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-left border border-gray-200 rounded-lg overflow-hidden">
          <thead className="bg-gray-100 text-gray-700 font-semibold">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={
                    paginatedAdjustments.length > 0 &&
                    selectedIds.length === paginatedAdjustments.length
                  }
                  onChange={handleSelectAll}
                />
              </th>
              <th className="px-4 py-3">Product Name</th>
              <th className="px-4 py-3">Quantity</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedAdjustments.length === 0 ? (
              <tr>
                <td colSpan="4" className="text-center py-6 text-gray-500">
                  No stock adjustments found.
                </td>
              </tr>
            ) : (
              paginatedAdjustments.map((adj) => (
                <tr key={adj.id}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(adj.id)}
                      onChange={() => handleSelect(adj.id)}
                    />
                  </td>
                  <td className="px-4 py-3">{adj.productName}</td>
                  <td className={`px-4 py-3 font-medium ${adj.quantity < 0 ? "text-red-600" : "text-green-600"}`}>
                    {adj.quantity}
                  </td>
                  <td className="px-4 py-3 flex gap-3">
                    <button className="text-indigo-600 hover:text-indigo-800">
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => handleSelect(adj.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex justify-between items-center mt-6">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Previous
          </button>

          <div className="space-x-2">
            {Array.from({ length: totalPages }, (_, index) => (
              <button
                key={index + 1}
                onClick={() => setCurrentPage(index + 1)}
                className={`px-3 py-1 rounded ${
                  currentPage === index + 1
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* Modal for Add New Adjustment */}
      <Modal
        open={modalVisible}
        title="Add New Adjustment"
        onCancel={() => setModalVisible(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleModalSubmit}>
          <Form.Item
            label="Product"
            name="product"
            rules={[{ required: true, message: "Please select a product" }]}
          >
            <Select
              showSearch
              placeholder="Search Product Name / Item Code / Scan bar code"
              allowClear
              suffixIcon={<Plus size={16} />}
            >
              <Option value="Product A">Product A</Option>
              <Option value="Product B">Product B</Option>
              <Option value="Product C">Product C</Option>
            </Select>
          </Form.Item>

          <Form.Item label="Current Stock">
            <div>-</div> {/* Replace with actual stock data */}
          </Form.Item>

          <Form.Item
            label="Quantity"
            name="quantity"
            rules={[{ required: true, message: "Please enter quantity" }]}
          >
            <InputNumber
              min={1}
              placeholder="Please Enter Quantity"
              value={quantity}
              onChange={setQuantity}
              style={{ width: "100%" }}
            />
          </Form.Item>

          <Form.Item
            label="Adjustment Type"
            name="adjustmentType"
            rules={[{ required: true, message: "Please select adjustment type" }]}
          >
            <Select defaultValue="Add">
              <Option value="Add">Add</Option>
              <Option value="Remove">Remove</Option>
            </Select>
          </Form.Item>

          <Form.Item label="Notes" name="notes">
            <TextArea placeholder="Notes" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<Save size={16} />}>
              Create
            </Button>
            <Button style={{ marginLeft: 8 }} onClick={() => setModalVisible(false)}>
              Cancel
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default StocjAdjustment;
