import express from "express";
import Company from "../../models/settings/company.js";
import mongoose from "mongoose";
const router = express.Router();
// Get all companies
router.get('/company-profile', async (req, res) => {
  try {
    const companies = await Company.find().sort({ createdAt: -1 });
    res.json({ 
      success: true, 
      companies 
    });
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching companies' 
    });
  }
});

// Get company by ID
router.get('/company-profile/:id', async (req, res) => { // Added missing slash before :id
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ 
        success: false, 
        message: 'Company not found' 
      });
    }
    res.json({ 
      success: true, 
      company 
    });
  } catch (error) {
    console.error('Error fetching company:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching company' 
    });
  }
});

// Create new company
router.post('/company-profile', async (req, res) => {
  try {
    const {
      companyCode,
      companyName,
      registrationNumber,
      address,
      phone,
      email,
      website,
      taxNumber,
      establishedDate,
      description
    } = req.body;

    // Check if company code already exists
    const existingCompany = await Company.findOne({ companyCode });
    if (existingCompany) {
      return res.status(400).json({
        success: false,
        message: 'Company code already exists'
      });
    }

    const newCompany = new Company({
      companyCode,
      companyName,
      registrationNumber,
      address,
      phone,
      email,
      website,
      taxNumber,
      establishedDate,
      description,
      enabled: true
    });

    await newCompany.save();
    
    res.status(201).json({
      success: true,
      message: 'Company created successfully',
      company: newCompany
    });
  } catch (error) {
    console.error('Error creating company:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating company'
    });
  }
});

// Update company
router.put('/company-profile/:id', async (req, res) => { // Added missing slash before :id
  try {
    const {
      companyName,
      registrationNumber,
      address,
      phone,
      email,
      website,
      taxNumber,
      establishedDate,
      description,
      enabled
    } = req.body;

    const updatedCompany = await Company.findByIdAndUpdate(
      req.params.id,
      {
        companyName,
        registrationNumber,
        address,
        phone,
        email,
        website,
        taxNumber,
        establishedDate,
        description,
        ...(enabled !== undefined && { enabled })
      },
      { new: true, runValidators: true }
    );

    if (!updatedCompany) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    res.json({
      success: true,
      message: 'Company updated successfully',
      company: updatedCompany
    });
  } catch (error) {
    console.error('Error updating company:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating company'
    });
  }
});

// Delete company
router.delete('/company-profile/:id', async (req, res) => { // Added missing slash before :id
  try {
    const deletedCompany = await Company.findByIdAndDelete(req.params.id);
    
    if (!deletedCompany) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    res.json({
      success: true,
      message: 'Company deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting company'
    });
  }
});

// Delete multiple companies
router.delete('/company-profile', async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No company IDs provided'
      });
    }

    // Validate ObjectIds
    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid company IDs provided'
      });
    }

    const result = await Company.deleteMany({ _id: { $in: validIds } });
    
    res.json({
      success: true,
      message: `${result.deletedCount} companies deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting companies:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting companies'
    });
  }
});

export default router;
