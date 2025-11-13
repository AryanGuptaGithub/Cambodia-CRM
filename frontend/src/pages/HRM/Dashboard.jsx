import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  LayoutDashboard, 
  CalendarCheck, 
  CalendarDays, 
  CalendarMinus, 
  DollarSign,
  Eye,
  Edit,
  Trash2,
  UserPlus,
  Search,
  X,
  Download,
  Upload
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../../utils/toast';
import { confirmDialog } from '../../utils/confirmationDialog';
import {fetchMRList} from "../../pages/ProductManager/common/fetchDropdown";

const Dashboard = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);

  // Enhanced data structures with more realistic data
  const [mrList] = useState([
    { 
      id: 'MR001', 
      name: 'Robert Johnson', 
      department: 'Quality Assurance', 
      designation: 'Senior Manager', 
      contact: 'robert.j@company.com', 
      status: 'Active',
      avatar: 'RJ'
    },
    { 
      id: 'MR002', 
      name: 'Sarah Williams', 
      department: 'Operations', 
      designation: 'Manager', 
      contact: 'sarah.w@company.com', 
      status: 'Active',
      avatar: 'SW'
    },
    { 
      id: 'MR003', 
      name: 'Michael Brown', 
      department: 'Human Resources', 
      designation: 'HR Manager', 
      contact: 'michael.b@company.com', 
      status: 'Inactive',
      avatar: 'MB'
    },
    { 
      id: 'MR004', 
      name: 'Lisa Anderson', 
      department: 'Finance', 
      designation: 'Finance Controller', 
      contact: 'lisa.a@company.com', 
      status: 'Active',
      avatar: 'LA'
    },
    { 
      id: 'MR005', 
      name: 'David Miller', 
      department: 'IT', 
      designation: 'IT Director', 
      contact: 'david.m@company.com', 
      status: 'Pending',
      avatar: 'DM'
    }
  ]);

  const [attendanceData] = useState([
    { id: 'EMP001', name: 'John Smith', date: '2023-05-15', checkIn: '09:05 AM', checkOut: '06:15 PM', status: 'Present', hours: '9h 10m' },
    { id: 'EMP002', name: 'Emily Davis', date: '2023-05-15', checkIn: '09:15 AM', checkOut: '05:45 PM', status: 'Present', hours: '8h 30m' },
    { id: 'EMP003', name: 'James Wilson', date: '2023-05-15', checkIn: '-', checkOut: '-', status: 'Absent', hours: '0h' }
  ]);

  const [holidayData] = useState([
    { id: 1, name: 'New Year', date: '2023-01-01', type: 'Public Holiday', duration: '1 day' },
    { id: 2, name: 'Company Foundation Day', date: '2023-03-15', type: 'Company Holiday', duration: '1 day' },
    { id: 3, name: 'Summer Break', date: '2023-07-01', type: 'Seasonal Holiday', duration: '3 days' }
  ]);

  const [leaveData] = useState([
    { id: 1, employee: 'John Smith', type: 'Sick Leave', from: '2023-05-10', to: '2023-05-12', status: 'Approved', days: 3 },
    { id: 2, employee: 'Sarah Johnson', type: 'Annual Leave', from: '2023-05-15', to: '2023-05-19', status: 'Pending', days: 5 },
    { id: 3, employee: 'Mike Brown', type: 'Emergency Leave', from: '2023-05-08', to: '2023-05-08', status: 'Approved', days: 1 }
  ]);

  const [payrollData] = useState([
    { id: 1, employee: 'Robert Johnson', department: 'Quality Assurance', salary: '$8,500', bonus: '$1,200', deductions: '$450', net: '$9,250', status: 'Processed' },
    { id: 2, employee: 'Sarah Williams', department: 'Operations', salary: '$7,200', bonus: '$800', deductions: '$380', net: '$7,620', status: 'Processed' },
    { id: 3, employee: 'Michael Brown', department: 'HR', salary: '$6,800', bonus: '$600', deductions: '$320', net: '$7,080', status: 'Pending' }
  ]);

  // Define getCurrentData function before using it in useMemo
  const getCurrentData = useCallback(() => {
    switch(activeSection) {
      case 'attendance': return attendanceData;
      case 'holidays': return holidayData;
      case 'leaves': return leaveData;
      case 'payroll': return payrollData;
      case 'dashboard': 
      default: return mrList;
    }
  }, [activeSection, attendanceData, holidayData, leaveData, payrollData, mrList]);

  // Filter data based on search term
  const filteredData = useMemo(() => {
    const currentData = getCurrentData();
    if (!searchTerm) return currentData;

    return currentData.filter(item =>
      Object.values(item).some(value =>
        value?.toString().toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [searchTerm, getCurrentData]);

  // Action handlers
  const handleEdit = useCallback((type, id) => {
    console.log(`Edit ${type} with ID:`, id);
    showToast('info', `Editing ${type} with ID: ${id}`);
  }, []);

  const handleDelete = useCallback(async (type, id, name) => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete this ${type} - ${name}?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      console.log(`Delete ${type} with ID:`, id);
      showToast('success', `${type} deleted successfully`);
    }
  }, []);

  const handleAddNew = useCallback((type) => {
    console.log(`Add new ${type}`);
    showToast('info', `Adding new ${type}`);
  }, []);

  const handleExport = useCallback((type) => {
    console.log(`Export ${type}`);
    showToast('success', `${type} data exported successfully`);
  }, []);

  // Navigation handlers
  const handleNavigation = useCallback((path) => {
    navigate(path);
  }, [navigate]);

  // Selection handlers
  const toggleSelect = useCallback((item) => {
    setSelected(prev => {
      const exists = prev.some(p => p.id === item.id);
      if (exists) {
        return prev.filter(p => p.id !== item.id);
      } else {
        return [...prev, { id: item.id, name: item.name || item.employee }];
      }
    });
  }, []);

  const toggleSelectAll = useCallback((checked, data) => {
    if (checked) {
      const allSelected = data.map(item => ({
        id: item.id,
        name: item.name || item.employee
      }));
      setSelected(allSelected);
    } else {
      setSelected([]);
    }
  }, []);

  // Dashboard Cards Component
  const DashboardCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Attendance</h3>
            <p className="text-sm text-gray-600">Present: 235/250</p>
          </div>
          <div className="p-3 bg-blue-100 rounded-lg">
            <CalendarCheck className="w-6 h-6 text-blue-600" />
          </div>
        </div>
        <div className="text-2xl font-bold text-gray-900">94%</div>
      </div>
      
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Holidays</h3>
            <p className="text-sm text-gray-600">Upcoming: 3</p>
          </div>
          <div className="p-3 bg-green-100 rounded-lg">
            <CalendarDays className="w-6 h-6 text-green-600" />
          </div>
        </div>
        <div className="text-2xl font-bold text-gray-900">12</div>
      </div>
      
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Leaves</h3>
            <p className="text-sm text-gray-600">Pending: 5</p>
          </div>
          <div className="p-3 bg-orange-100 rounded-lg">
            <CalendarMinus className="w-6 h-6 text-orange-600" />
          </div>
        </div>
        <div className="text-2xl font-bold text-gray-900">18</div>
      </div>
      
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Payroll</h3>
            <p className="text-sm text-gray-600">Processed this month</p>
          </div>
          <div className="p-3 bg-purple-100 rounded-lg">
            <DollarSign className="w-6 h-6 text-purple-600" />
          </div>
        </div>
        <div className="text-2xl font-bold text-gray-900">$245,680</div>
      </div>
    </div>
  );

  // Common Table Component
  const DataTable = ({ 
    data, 
    columns, 
    onEdit, 
    onDelete, 
    onAdd, 
    onExport,
    selectable = false 
  }) => (
    <div className="bg-white rounded-xl shadow-md border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h3 className="text-xl font-semibold text-gray-800">
            {activeSection.charAt(0).toUpperCase() + activeSection.slice(1)} Management
          </h3>
          <div className="flex gap-3">
            {onExport && (
              <button
                onClick={onExport}
                className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <Download size={18} /> Export
              </button>
            )}
            {onAdd && (
              <button
                onClick={onAdd}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <UserPlus size={18} /> Add New
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {selectable && (
                <th className="p-4 text-left">
                  <input
                    type="checkbox"
                    checked={selected.length === data.length && data.length > 0}
                    onChange={(e) => toggleSelectAll(e.target.checked, data)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
              )}
              {columns.map(column => (
                <th key={column.key} className="p-4 text-left text-sm font-semibold text-gray-700">
                  {column.title}
                </th>
              ))}
              <th className="p-4 text-left text-sm font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((item, index) => (
              <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                {selectable && (
                  <td className="p-4">
                    <input
                      type="checkbox"
                      checked={selected.some(s => s.id === item.id)}
                      onChange={() => toggleSelect(item)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                )}
                {columns.map(column => (
                  <td key={column.key} className="p-4 text-sm text-gray-600">
                    {column.render ? column.render(item) : item[column.key]}
                  </td>
                ))}
                <td className="p-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => onEdit?.(activeSection, item.id)}
                      className="text-blue-600 hover:text-blue-800 transition-colors p-1 rounded hover:bg-blue-50"
                      title="Edit"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => onDelete?.(activeSection, item.id, item.name || item.employee)}
                      className="text-red-600 hover:text-red-800 transition-colors p-1 rounded hover:bg-red-50"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {data.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No data found
          </div>
        )}
      </div>
    </div>
  );

  // MR List Component
  const MRList = () => {
    const columns = [
      { key: 'id', title: 'MR ID' },
      { 
        key: 'name', 
        title: 'Name',
        render: (item) => (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-sm font-semibold">
              {item.avatar}
            </div>
            <span>{item.name}</span>
          </div>
        )
      },
      { key: 'department', title: 'Department' },
      { key: 'designation', title: 'Designation' },
      { key: 'contact', title: 'Contact' },
      { 
        key: 'status', 
        title: 'Status',
        render: (item) => (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            item.status === 'Active' ? 'bg-green-100 text-green-800' :
            item.status === 'Inactive' ? 'bg-red-100 text-red-800' :
            'bg-yellow-100 text-yellow-800'
          }`}>
            {item.status}
          </span>
        )
      }
    ];

    return (
      <DataTable
        data={filteredData}
        columns={columns}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onAdd={() => handleAddNew('MR')}
        selectable={true}
      />
    );
  };

  // Attendance Component
  const Attendance = () => {
    const columns = [
      { key: 'id', title: 'Employee ID' },
      { key: 'name', title: 'Name' },
      { key: 'date', title: 'Date' },
      { key: 'checkIn', title: 'Check In' },
      { key: 'checkOut', title: 'Check Out' },
      { key: 'hours', title: 'Hours' },
      { 
        key: 'status', 
        title: 'Status',
        render: (item) => (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            item.status === 'Present' ? 'bg-green-100 text-green-800' :
            'bg-red-100 text-red-800'
          }`}>
            {item.status}
          </span>
        )
      }
    ];

    return (
      <DataTable
        data={filteredData}
        columns={columns}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onExport={() => handleExport('Attendance')}
        selectable={true}
      />
    );
  };

  // Holidays Component
  const Holidays = () => {
    const columns = [
      { key: 'name', title: 'Holiday Name' },
      { key: 'date', title: 'Date' },
      { key: 'type', title: 'Type' },
      { key: 'duration', title: 'Duration' }
    ];

    return (
      <DataTable
        data={filteredData}
        columns={columns}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onAdd={() => handleAddNew('Holiday')}
        selectable={true}
      />
    );
  };

  // Leaves Component
  const Leaves = () => {
    const columns = [
      { key: 'employee', title: 'Employee' },
      { key: 'type', title: 'Leave Type' },
      { key: 'from', title: 'From' },
      { key: 'to', title: 'To' },
      { key: 'days', title: 'Days' },
      { 
        key: 'status', 
        title: 'Status',
        render: (item) => (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            item.status === 'Approved' ? 'bg-green-100 text-green-800' :
            item.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }`}>
            {item.status}
          </span>
        )
      }
    ];

    return (
      <DataTable
        data={filteredData}
        columns={columns}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onAdd={() => handleAddNew('Leave')}
        selectable={true}
      />
    );
  };

  // Payroll Component
  const Payroll = () => {
    const columns = [
      { key: 'employee', title: 'Employee' },
      { key: 'department', title: 'Department' },
      { key: 'salary', title: 'Basic Salary' },
      { key: 'bonus', title: 'Bonus' },
      { key: 'deductions', title: 'Deductions' },
      { 
        key: 'net', 
        title: 'Net Salary',
        render: (item) => (
          <span className="font-semibold text-green-600">{item.net}</span>
        )
      },
      { 
        key: 'status', 
        title: 'Status',
        render: (item) => (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            item.status === 'Processed' ? 'bg-green-100 text-green-800' :
            'bg-yellow-100 text-yellow-800'
          }`}>
            {item.status}
          </span>
        )
      }
    ];

    return (
      <DataTable
        data={filteredData}
        columns={columns}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onExport={() => handleExport('Payroll')}
        selectable={true}
      />
    );
  };

  // Sidebar Component
  const Sidebar = () => {
    const menuItems = [
      { key: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { key: 'attendance', icon: CalendarCheck, label: 'Attendance' },
      { key: 'holidays', icon: CalendarDays, label: 'Holidays' },
      { key: 'leaves', icon: CalendarMinus, label: 'Leaves' },
      { key: 'payroll', icon: DollarSign, label: 'Payroll' }
    ];

    return (
      <div className="w-64 bg-white shadow-lg h-screen fixed left-0 top-0">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-800">
            HRM<span className="text-indigo-600">Dashboard</span>
          </h1>
        </div>
        
        <nav className="p-4">
          <ul className="space-y-2">
            {menuItems.map(item => (
              <li key={item.key}>
                <button
                  onClick={() => setActiveSection(item.key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeSection === item.key
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <item.icon size={20} />
                  <span className="font-medium">{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    );
  };

  // Main Content Renderer
  const renderContent = () => {
    switch(activeSection) {
      case 'dashboard':
        return (
          <>
            <DashboardCards />
            <MRList />
          </>
        );
      case 'attendance':
        return <Attendance />;
      case 'holidays':
        return <Holidays />;
      case 'leaves':
        return <Leaves />;
      case 'payroll':
        return <Payroll />;
      default:
        return (
          <>
            <DashboardCards />
            <MRList />
          </>
        );
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      {/* Main Content */}
      <div className="flex-1 ml-64">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-6 py-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-semibold text-gray-800 capitalize">
                  {activeSection} Overview
                </h2>
                <p className="text-gray-600 mt-1">
                  Manage your HR operations efficiently
                </p>
              </div>
              
              <div className="flex items-center gap-4">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 w-64"
                  />
                </div>

                {/* User Info */}
                <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-2">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold">
                    JD
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800">John Doe</div>
                    <div className="text-xs text-gray-600">HR Manager</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="p-6">
          {selected.length > 0 && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-blue-800">
                  {selected.length} item(s) selected
                </span>
                <button
                  onClick={() => setSelected([])}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  Clear selection
                </button>
              </div>
            </div>
          )}

          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;