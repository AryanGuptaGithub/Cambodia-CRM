import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    // 1. Find user
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(400).json({
        message: 'Invalid username or password',
      });
    }

    // 2. Validate password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: 'Invalid username or password',
      });
    }

    // 3. Build safe JWT payload (DO NOT over-minimize it)
    const payload = {
      id: user._id.toString(),
      name: user.name || user.username || 'unknown',
      email: user.email || null,
      role: user.role || 'user',
    };

    // 4. Sign token
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    // 5. Return response
    return res.json({
      success: true,
      token,
      user: {
        id: payload.id,
        name: payload.name,
        email: payload.email,
        role: payload.role,
        username: user.username,
      },
    });
  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    return res.status(500).json({
      message: 'Server error',
    });
  }
};