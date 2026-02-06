import express from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import Transaction from '../models/Transaction.js';
import CategoryType from '../models/CategoryType.js';
import Destination from '../models/Destination.js';
import Supplier from '../models/Supplier.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Helper function to map Excel category names to transactionType
const mapCategoryToTransactionType = (categoryName) => {
  const categoryMap = {
    'cash sale': 'cash sale',
    'credit collection': 'credit collection',
    'payment inward': 'payment inward',
    'payment outward': 'payment outward',
    'deposit': 'deposit',
    'withdraw': 'withdraw',
    'remittance': 'remittance'
  };
  
  const lowerCategory = categoryName?.toLowerCase()?.trim();
  return categoryMap[lowerCategory] || null;
};

// Helper function to find or create CategoryType
const findOrCreateCategory = async (categoryName, userId) => {
  if (!categoryName) return null;
  
  const transactionType = mapCategoryToTransactionType(categoryName);
  if (!transactionType) {
    throw new Error(`Invalid category type: ${categoryName}`);
  }
  
  let category = await CategoryType.findOne({ 
    name: { $regex: new RegExp(`^${categoryName.trim()}$`, 'i') }
  });
  
  if (!category) {
    category = new CategoryType({
      name: categoryName.trim(),
      transactionType: transactionType,
      createdBy: userId,
      isActive: true
    });
    await category.save();
  }
  
  return category;
};



export default router;