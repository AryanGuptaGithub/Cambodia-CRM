import express from "express";
import Zone from "../../models/master/zone.js";

const router = express.Router();

// GET all zones
router.get('/zones', async (req, res) => {
  try {
    const zones = await Zone.find().sort({ name: 1 });
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
router.get('/zone/:id', async (req, res) => {
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

// POST create new zone
router.post('/zone', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Zone name is required'
      });
    }

    // Check if zone already exists
    const existingZone = await Zone.findOne({ name: name.trim() });
    if (existingZone) {
      return res.status(400).json({
        success: false,
        message: 'Zone with this name already exists'
      });
    }

    const newZone = new Zone({ name: name.trim() });
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
router.put('/zone/:id', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Zone name is required'
      });
    }

    const updatedZone = await Zone.findByIdAndUpdate(
      req.params.id,
      { name: name.trim() },
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

// DELETE zone
router.delete('/zone/:id', async (req, res) => {
  try {
    const deletedZone = await Zone.findByIdAndDelete(req.params.id);

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
