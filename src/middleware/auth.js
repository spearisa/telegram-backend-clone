const jwt = require('jsonwebtoken');
const { query } = require('../database/connection');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided',
        code: 'NO_TOKEN'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const result = await query(
      'SELECT id, username, email, first_name, last_name, bio, profile_picture, is_online, last_seen, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Token is not valid',
        code: 'INVALID_TOKEN'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Token has expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    console.error('Auth middleware error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );

  return { accessToken, refreshToken };
};

const saveRefreshToken = async (userId, refreshToken) => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

  await query(
    'INSERT INTO user_sessions (user_id, refresh_token, expires_at) VALUES (?, ?, ?)',
    [userId, refreshToken, expiresAt]
  );
};

const verifyRefreshToken = async (refreshToken) => {
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    // Check if refresh token exists in database
    const result = await query(
      'SELECT user_id FROM user_sessions WHERE refresh_token = ? AND expires_at > datetime("now")',
      [refreshToken]
    );

    if (result.rows.length === 0) {
      throw new Error('Refresh token not found or expired');
    }

    return decoded.userId;
  } catch (error) {
    throw error;
  }
};

const revokeRefreshToken = async (refreshToken) => {
  await query(
    'DELETE FROM user_sessions WHERE refresh_token = ?',
    [refreshToken]
  );
};

module.exports = {
  authenticateToken,
  generateTokens,
  saveRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken
};
