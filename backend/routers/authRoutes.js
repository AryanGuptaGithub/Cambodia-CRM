const express = require('express');
const router = express.Router();
const { login } = require('../controllers/authController');
const protect = require('../middleware/authMiddleware');

// Public login route
router.post('/login', login);

// Example protected route
router.get('/dashboard', protect, (req, res) => {
  res.json({ message: `Welcome, user ID: ${req.user.id}` });
});

module.exports = router;
