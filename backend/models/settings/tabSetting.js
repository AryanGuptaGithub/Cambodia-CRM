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

// ✅ NEW: Virtual sequence calculation method
hTabSchema.methods.getVirtualSequence = async function() {
  const HTab = mongoose.model('HTab');
  
  // Get all visible tabs with the same parent, sorted by actual sequence
  const visibleSiblings = await HTab.find({
    parentTabId: this.parentTabId,
    isVisible: true,
    isActive: true
  }).sort({ sequence: 1 });
  
  // Find the position of current tab in visible siblings
  const virtualSequence = visibleSiblings.findIndex(sibling => 
    sibling.tabId === this.tabId
  ) + 1; // +1 because index starts from 0
  
  return virtualSequence > 0 ? virtualSequence : 1;
};

// ✅ NEW: Static method to get all tabs with virtual sequences
hTabSchema.statics.getTabsWithVirtualSequences = async function() {
  const HTab = mongoose.model('HTab');
  const allTabs = await HTab.find({ isActive: true }).sort({ sequence: 1 });
  
  // Create a map for quick lookup
  const tabsMap = new Map();
  allTabs.forEach(tab => tabsMap.set(tab.tabId, tab));
  
  // Group tabs by parent
  const tabsByParent = {};
  allTabs.forEach(tab => {
    const parentId = tab.parentTabId || 'root';
    if (!tabsByParent[parentId]) {
      tabsByParent[parentId] = [];
    }
    tabsByParent[parentId].push(tab);
  });
  
  // Calculate virtual sequences for each group
  const tabsWithVirtualSequences = [];
  
  for (const [parentId, tabs] of Object.entries(tabsByParent)) {
    // Filter visible tabs and sort by actual sequence
    const visibleTabs = tabs
      .filter(tab => tab.isVisible)
      .sort((a, b) => a.sequence - b.sequence);
    
    // Assign virtual sequences
    visibleTabs.forEach((tab, index) => {
      tabsWithVirtualSequences.push({
        ...tab.toObject(),
        virtualSequence: index + 1
      });
    });
    
    // Also include hidden tabs with virtual sequence 0
    const hiddenTabs = tabs.filter(tab => !tab.isVisible);
    hiddenTabs.forEach(tab => {
      tabsWithVirtualSequences.push({
        ...tab.toObject(),
        virtualSequence: 0 // Hidden tabs get virtual sequence 0
      });
    });
  }
  
  return tabsWithVirtualSequences;
};

// ✅ NEW: Method to get hierarchy with virtual sequences
hTabSchema.statics.getHierarchyWithVirtualSequences = async function() {
  const HTab = mongoose.model('HTab');
  const allTabs = await HTab.find({ isActive: true }).sort({ sequence: 1 });
  
  const buildHierarchy = (parentId = null) => {
    const children = allTabs
      .filter(tab => tab.parentTabId === parentId)
      .sort((a, b) => a.sequence - b.sequence);
    
    // Calculate virtual sequences for this level
    const visibleChildren = children.filter(tab => tab.isVisible);
    
    return children.map(tab => {
      const virtualSequence = visibleChildren.findIndex(child => 
        child.tabId === tab.tabId
      ) + 1;
      
      return {
        ...tab.toObject(),
        virtualSequence: tab.isVisible ? virtualSequence : 0,
        children: buildHierarchy(tab.tabId)
      };
    });
  };
  
  return buildHierarchy();
};

export default mongoose.model('HTab', hTabSchema);