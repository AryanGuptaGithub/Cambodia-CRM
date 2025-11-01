const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema({
  zoneName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  zoneCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  states: [{
    stateName: {
      type: String,
      required: true,
      trim: true
    },
    stateCode: {
      type: String,
      required: true,
      trim: true
    },
    districts: [{
      districtName: {
        type: String,
        required: true,
        trim: true
      },
      districtCode: {
        type: String,
        required: true,
        trim: true
      }
    }]
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  description: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for efficient searching
zoneSchema.index({ zoneName: 1, zoneCode: 1 });
zoneSchema.index({ 'states.stateName': 1 });
zoneSchema.index({ 'states.districts.districtName': 1 });

module.exports = mongoose.model('Zone', zoneSchema);