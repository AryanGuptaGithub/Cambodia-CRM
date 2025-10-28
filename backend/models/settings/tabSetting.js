// models/HTab.js
import mongoose from 'mongoose';

const hTabSchema = new mongoose.Schema({
  tabId: {
    type: String,
    required: [true, 'Tab ID is required'],
    trim: true,
    unique: true
  },
  name: {
    type: String,
    required: [true, 'Tab name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  path: {
    type: String,
    trim: true,
    default: ''
  },
  icon: {
    type: String,
    default: ''
  },
  parentTabId: {
    type: String,
    default: null
  },
  level: {
    type: Number,
    default: 0 // 0: main tab, 1: sub-tab, 2: nested sub-tab
  },
  sequence: {
    type: Number,
    default: 0
  },
  isVisible: {
    type: Boolean,
    default: true
  },
  category: {
    type: String,
    enum: ['main', 'reports', 'settings', 'utility', 'hrm', 'products', 'purchase', 'sales', 'expense', 'accounts', 'staff'],
    default: 'main'
  },
  reportType: {
    type: String,
    enum: ['Hide/Show Tabs', 'Sequence Number', 'All'],
    default: 'All'
  },
  permissions: [{
    type: String,
    enum: ['read', 'write', 'delete', 'admin']
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for better performance
hTabSchema.index({ tabId: 1 });
hTabSchema.index({ parentTabId: 1 });
hTabSchema.index({ sequence: 1 });
hTabSchema.index({ isVisible: 1 });
hTabSchema.index({ category: 1 });
hTabSchema.index({ level: 1 });
hTabSchema.index({ reportType: 1 });
hTabSchema.index({ isActive: 1 });

// Virtual for children tabs
hTabSchema.virtual('children', {
  ref: 'HTab',
  localField: 'tabId',
  foreignField: 'parentTabId'
});

export default mongoose.model('HTab', hTabSchema);