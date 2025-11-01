const express = require('express');
const router = express.Router();
const Zone = require('../models/Zone');

// GET all zones
router.get('/zone', async (req, res) => {
  try {
    const zones = await Zone.find({ isActive: true })
      .select('zoneName zoneCode states description')
      .sort({ zoneName: 1 });
    
    res.json(zones);
  } catch (error) {
    console.error('Error fetching zones:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching zones',
      error: error.message 
    });
  }
});

// GET zone by ID
router.get('/zone:id', async (req, res) => {
  try {
    const zone = await Zone.findById(req.params.id);
    
    if (!zone) {
      return res.status(404).json({ 
        success: false, 
        message: 'Zone not found' 
      });
    }
    
    res.json(zone);
  } catch (error) {
    console.error('Error fetching zone:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching zone',
      error: error.message 
    });
  }
});

// GET states by zone code
router.get('/:zoneCode/states', async (req, res) => {
  try {
    const zone = await Zone.findOne({ 
      zoneCode: req.params.zoneCode.toUpperCase(),
      isActive: true 
    });
    
    if (!zone) {
      return res.status(404).json({ 
        success: false, 
        message: 'Zone not found' 
      });
    }
    
    res.json({
      success: true,
      zone: zone.zoneName,
      states: zone.states
    });
  } catch (error) {
    console.error('Error fetching states:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching states',
      error: error.message 
    });
  }
});

// POST create new zone (Admin only)
router.post('/zone', async (req, res) => {
  try {
    const { zoneName, zoneCode, states, description } = req.body;
    
    // Check if zone already exists
    const existingZone = await Zone.findOne({
      $or: [{ zoneName }, { zoneCode: zoneCode.toUpperCase() }]
    });
    
    if (existingZone) {
      return res.status(400).json({
        success: false,
        message: 'Zone with this name or code already exists'
      });
    }
    
    const newZone = new Zone({
      zoneName,
      zoneCode: zoneCode.toUpperCase(),
      states: states || [],
      description
    });
    
    const savedZone = await newZone.save();
    
    res.status(201).json({
      success: true,
      message: 'Zone created successfully',
      zone: savedZone
    });
  } catch (error) {
    console.error('Error creating zone:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while creating zone',
      error: error.message 
    });
  }
});

// PUT update zone
router.put('/zone:id', async (req, res) => {
  try {
    const updatedZone = await Zone.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    
    if (!updatedZone) {
      return res.status(404).json({ 
        success: false, 
        message: 'Zone not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Zone updated successfully',
      zone: updatedZone
    });
  } catch (error) {
    console.error('Error updating zone:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while updating zone',
      error: error.message 
    });
  }
});

// DELETE zone (soft delete)
router.delete('/zone:id', async (req, res) => {
  try {
    const deletedZone = await Zone.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    if (!deletedZone) {
      return res.status(404).json({ 
        success: false, 
        message: 'Zone not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Zone deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting zone:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while deleting zone',
      error: error.message 
    });
  }
});

export default router;