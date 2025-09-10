import React, { useState } from "react";
import { Form, Input, Select, Button, Upload, InputNumber, DatePicker, message } from "antd";
import { Plus, Camera, Barcode, DollarSign } from "lucide-react";
import { UploadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

const { Option } = Select;
const { TextArea } = Input;

const AddProductForm = () => {
  const [form] = Form.useForm();
  const [imageUrl, setImageUrl] = useState(null);
  const [fileList, setFileList] = useState([]);

  const handleImageUpload = (info) => {
    if (info.file.status === "done") {
      setImageUrl(info.file.response.url);
    }
    setFileList(info.fileList);
  };

  const onFinish = (values) => {
    // Handle form submission logic here
    console.log("Form Values: ", values);
    message.success("Product added successfully!");
  };

  return (
    <div className="container">
      <h2>Add New Product</h2>
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          productType: "Single Type Product",
        }}
        style={{ maxWidth: 900 }}
      >
        {/* Product Type */}
        <Form.Item
          name="productType"
          label="Product Type"
          rules={[{ required: true, message: "Please select product type!" }]}
        >
          <Select>
            <Option value="Single Type Product">Single Type Product</Option>
            <Option value="Variant Type Product">Variant Type Product</Option>
            <Option value="Service Type Product">Service Type Product</Option>
          </Select>
        </Form.Item>

        {/* Image Upload */}
        <Form.Item
          name="image"
          label="Image"
          valuePropName="fileList"
          getValueFromEvent={(e) => e && e.fileList}
          rules={[{ required: true, message: "Please upload an image!" }]}
        >
          <Upload
            action="/upload" // Use your backend API for file upload
            listType="picture-card"
            fileList={fileList}
            onChange={handleImageUpload}
            beforeUpload={() => false} // To prevent auto-upload in this example
          >
            {imageUrl ? <img src={imageUrl} alt="product" style={{ width: "100%" }} /> : <Plus />}
          </Upload>
        </Form.Item>

        {/* Warehouse */}
        <Form.Item
          name="warehouse"
          label="Warehouse"
          rules={[{ required: true, message: "Please select a warehouse!" }]}
        >
          <Select>
            <Option value="Electronify">Electronify</Option>
            <Option value="Warehouse2">Warehouse 2</Option>
            <Option value="Warehouse3">Warehouse 3</Option>
          </Select>
        </Form.Item>

        {/* Name */}
        <Form.Item
          name="name"
          label="Name"
          rules={[{ required: true, message: "Please enter the product name!" }]}
        >
          <Input placeholder="Please Enter Name" />
        </Form.Item>

        {/* Slug */}
        <Form.Item
          name="slug"
          label="Slug"
          rules={[{ required: true, message: "Please enter the product slug!" }]}
        >
          <Input placeholder="Please Enter Slug" />
        </Form.Item>

        {/* Category */}
        <Form.Item
          name="category"
          label="Category"
          rules={[{ required: true, message: "Please select a category!" }]}
        >
          <Select>
            <Option value="Category1">Category 1</Option>
            <Option value="Category2">Category 2</Option>
            <Option value="Category3">Category 3</Option>
          </Select>
        </Form.Item>

        {/* Brand */}
        <Form.Item
          name="brand"
          label="Brand"
          rules={[{ required: true, message: "Please select a brand!" }]}
        >
          <Select>
            <Option value="Brand1">Brand 1</Option>
            <Option value="Brand2">Brand 2</Option>
            <Option value="Brand3">Brand 3</Option>
          </Select>
        </Form.Item>

        {/* Quantity Alert */}
        <Form.Item
          name="quantityAlert"
          label="Quantity Alert"
          rules={[{ required: true, message: "Please enter quantity alert!" }]}
        >
          <InputNumber style={{ width: "100%" }} placeholder="Please Enter Quantity Alert" />
        </Form.Item>

        {/* Barcode Symbology */}
        <Form.Item
          name="barcodeSymbology"
          label="Barcode Symbology"
          initialValue="CODE128"
          rules={[{ required: true, message: "Please select barcode symbology!" }]}
        >
          <Select>
            <Option value="CODE128">CODE128</Option>
            <Option value="EAN13">EAN13</Option>
            <Option value="UPC">UPC</Option>
          </Select>
        </Form.Item>

        {/* Item Code */}
        <Form.Item
          name="itemCode"
          label="Item Code"
          rules={[{ required: true, message: "Please enter item code!" }]}
        >
          <Input placeholder="Please Enter Item Code" suffix={<Barcode />} />
        </Form.Item>

        {/* Price & Tax */}
        <Form.Item
          name="tax"
          label="Tax"
          rules={[{ required: true, message: "Please select tax!" }]}
        >
          <Select>
            <Option value="gst">GST</Option>
            <Option value="vat">VAT</Option>
            <Option value="none">None</Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="openingStock"
          label="Opening Stock"
          rules={[{ required: true, message: "Please enter opening stock!" }]}
        >
          <InputNumber style={{ width: "100%" }} placeholder="Enter opening stock" />
        </Form.Item>

        <Form.Item
          name="purchasePrice"
          label="Purchase Price"
          rules={[{ required: true, message: "Please enter purchase price!" }]}
        >
          <InputNumber
            style={{ width: "100%" }}
            prefix={<DollarSign />}
            placeholder="Please Enter Purchase Price"
          />
        </Form.Item>

        <Form.Item
          name="salesPrice"
          label="Sales Price"
          rules={[{ required: true, message: "Please enter sales price!" }]}
        >
          <InputNumber
            style={{ width: "100%" }}
            prefix={<DollarSign />}
            placeholder="Please Enter Sales Price"
          />
        </Form.Item>

        {/* Expiry Date */}
        <Form.Item
          name="expiryDate"
          label="Expiry Date"
          rules={[{ required: true, message: "Please select expiry date!" }]}
        >
          <DatePicker
            style={{ width: "100%" }}
            format="YYYY-MM-DD"
            placeholder="Select Expiry Date"
          />
        </Form.Item>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button onClick={() => form.resetFields()}>Cancel</Button>
          <Button type="primary" htmlType="submit">
            Create
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default AddProductForm;
