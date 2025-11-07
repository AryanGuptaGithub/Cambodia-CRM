import ProductType from "../../models/projectManger/productType.js"
import express from "express";
const router = express.Router();
router.get('/product-types', async (req, res) => {
  try {
    const productTypes = await ProductType.find().sort({ name: 1 });
    res.json({
      success: true,
      data: productTypes,
      message: 'Product types retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching product types:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching product types',
      error: error.message
    });
  }
});

// GET /api/product-types/:id - Get single product type
router.get('/product-types/:id', async (req, res) => {
  try {
    const productType = await ProductType.findById(req.params.id);
    
    if (!productType) {
      return res.status(404).json({
        success: false,
        message: 'Product type not found'
      });
    }
    
    res.json({
      success: true,
      data: productType
    });
  } catch (error) {
    console.error('Error fetching product type:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching product type',
      error: error.message
    });
  }
});

export default router;