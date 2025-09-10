import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Input,
  Form,
  Select,
  DatePicker,
  Button,
  InputNumber,
  Table,
} from 'antd';
import {
  Plus,
  Calendar,
  Search,
  Save,
} from 'lucide-react';

const { Option } = Select;
const { TextArea } = Input;


const StockTransferForm = () => {
  const [form] = Form.useForm();
  const [items, setItems] = useState([]);
const navigate = useNavigate();

  const columns = [
    { title: '#', dataIndex: 'key', key: 'key' },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Quantity', dataIndex: 'quantity', key: 'quantity' },
    { title: 'Unit Price', dataIndex: 'unitPrice', key: 'unitPrice' },
    { title: 'Discount', dataIndex: 'discount', key: 'discount' },
    { title: 'Tax', dataIndex: 'tax', key: 'tax' },
    { title: 'SubTotal', dataIndex: 'subTotal', key: 'subTotal' },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <Button danger onClick={() => handleRemove(record.key)}>
          Remove
        </Button>
      ),
    },
  ];

  const handleRemove = (key) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
  };

  const onFinish = (values) => {
    console.log('Form Submitted', values, 'Items:', items);
    // Add actual save or API logic here.
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}
    >
      <Form.Item name="invoiceNumber" label="Invoice Number">
        <Input placeholder="Please Enter Invoice Number" />
        <small>Leave it blank to generate automatically</small>
      </Form.Item>

      <Form.Item
        name="warehouse"
        label="Warehouse"
        rules={[{ required: true, message: 'Please select a warehouse' }]}
      >
        <Input.Group compact>
          <Select
            showSearch
            placeholder="Select Warehouse..."
            style={{ width: 'calc(100% - 32px)' }}
          >
            <Option value="wh1">Warehouse 1</Option>
            <Option value="wh2">Warehouse 2</Option>
          </Select>
          <Button icon={<Plus size={16} />} />
        </Input.Group>
      </Form.Item>

      <Form.Item
        name="transferDate"
        label="Stock Transfer Date"
        rules={[{ required: true, message: 'Please select a date' }]}
      >
        <DatePicker
          showTime
          style={{ width: '100%' }}
          suffixIcon={<Calendar size={16} />}
        />
      </Form.Item>

      <Form.Item name="product" label="Product">
        <Input.Group compact>
          <Select
            showSearch
            placeholder="Search Product..."
            style={{ width: 'calc(100% - 32px)' }}
            suffixIcon={<Search size={16} />}
          >
            <Option value="p1">Product 1</Option>
            <Option value="p2">Product 2</Option>
          </Select>
          <Button icon={<Plus size={16} />} />
        </Input.Group>
      </Form.Item>

      <Table
        dataSource={items}
        columns={columns}
        pagination={false}
        locale={{ emptyText: 'No data' }}
        style={{ marginBottom: 16 }}
      />

      <Form.Item name="terms" label="Terms & Conditions">
        <TextArea rows={2} placeholder="Terms & Conditions" />
      </Form.Item>

      <Form.Item name="notes" label="Notes">
        <TextArea rows={2} placeholder="Notes" />
      </Form.Item>

      <Form.Item
        name="orderStatus"
        label="Order Status"
        rules={[{ required: true, message: 'Please select order status' }]}
      >
        <Select placeholder="Select Order Status...">
          <Option value="draft">Draft</Option>
          <Option value="confirmed">Confirmed</Option>
          <Option value="shipped">Shipped</Option>
        </Select>
      </Form.Item>

      <Form.Item name="orderTax" label="Order Tax">
        <Input.Group compact>
          <Select
            showSearch
            placeholder="Select Order Tax..."
            style={{ width: 'calc(100% - 32px)' }}
          >
            <Option value="gst">GST</Option>
            <Option value="vat">VAT</Option>
          </Select>
          <Button icon={<Plus size={16} />} />
        </Input.Group>
      </Form.Item>

      <Form.Item name="discount" label="Discount ($)">
        <InputNumber style={{ width: '100%' }} min={0} placeholder="Please Enter Discount" />
      </Form.Item>

      <Form.Item name="shipping" label="Shipping ($)">
        <InputNumber style={{ width: '100%' }} min={0} placeholder="Please Enter Shipping" />
      </Form.Item>

      <div className="summary-row" style={{ marginBottom: 16 }}>
        <div><strong>Order Tax:</strong> $0.00</div>
        <div><strong>Discount:</strong> $0.00</div>
        <div><strong>Shipping:</strong> $0.00</div>
        <div><strong>Grand Total:</strong> $0.00</div>
      </div>

      <Button type="primary" block icon={<Save size={16} />} htmlType="submit">
        Save
      </Button>
      <Button
  danger
  block
  style={{ marginTop: 8 }}
  onClick={() => navigate('/stocktransfer')}
>
  Cancel
</Button>

    </Form>
  );
};

export default StockTransferForm;
