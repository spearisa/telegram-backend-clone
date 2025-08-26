const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../database/connection');
const { 
  authenticateToken, 
  generateTokens, 
  saveRefreshToken, 
  verifyRefreshToken, 
  revokeRefreshToken 
} = require('../middleware/auth');
const { generateSignalKeys } = require('../services/signalService');

const router = express.Router();

// Register new user
router.post('/register', [
  body('username')
    .isLength({ min: 3, max: 30 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username must be 3-30 characters, alphanumeric and underscore only'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Must be a valid email address'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long'),
  body('phoneNumber')
    .optional()
    .matches(/^[\+]?[1-9][\d]{0,15}$/)
    .withMessage('Phone number must be valid (e.g., +1234567890 or 1234567890)'),
  body('firstName')
    .notEmpty()
    .isLength({ max: 50 })
    .withMessage('First name is required and must be 50 characters or less'),
  body('lastName')
    .notEmpty()
    .isLength({ max: 50 })
    .withMessage('Last name is required and must be 50 characters or less')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Invalid input data',
        details: errors.array(),
        code: 'VALIDATION_ERROR'
      });
    }

    const { 
      username, 
      email, 
      password, 
      phoneNumber, 
      firstName, 
      lastName, 
      profilePicture 
    } = req.body;

    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE username = ? OR email = ? OR phone_number = ?',
      [username, email, phoneNumber]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'Username, email, or phone number already registered',
        code: 'USER_EXISTS'
      });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Generate Signal Protocol keys
    const signalKeys = await generateSignalKeys();

    // Create user
    const userId = uuidv4();
    await query(
      `INSERT INTO users (
        id, username, email, phone_number, password_hash, 
        first_name, last_name, profile_picture
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, username, email, phoneNumber, passwordHash, firstName, lastName, profilePicture]
    );

    // Save Signal keys
    await query(
      `INSERT INTO signal_keys (
        user_id, identity_key_public, identity_key_private, registration_id
      ) VALUES (?, ?, ?, ?)`,
      [userId, signalKeys.identityKey.publicKey, signalKeys.identityKey.privateKey, signalKeys.registrationId]
    );

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(userId);
    await saveRefreshToken(userId, refreshToken);

    // Get user data
    const userResult = await query(
      'SELECT id, username, email, first_name, last_name, bio, profile_picture, created_at FROM users WHERE id = ?',
      [userId]
    );

    res.status(201).json({
      accessToken,
      refreshToken,
      expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
      user: userResult.rows[0],
      signalKeys: {
        identityKey: {
          publicKey: signalKeys.identityKey.publicKey,
          privateKey: signalKeys.identityKey.privateKey
        },
        preKeys: signalKeys.preKeys,
        signedPreKey: signalKeys.signedPreKey
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: 'Failed to create user account',
      code: 'REGISTRATION_ERROR'
    });
  }
});

// Login user
router.post('/login', [
  body('identifier')
    .notEmpty()
    .withMessage('Username or email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Invalid input data',
        details: errors.array(),
        code: 'VALIDATION_ERROR'
      });
    }

    const { identifier, password } = req.body;

    // Find user by username or email
    const userResult = await query(
      'SELECT id, username, email, password_hash, first_name, last_name, bio, profile_picture FROM users WHERE username = ? OR email = ?',
      [identifier, identifier]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Username/email or password is incorrect',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const user = userResult.rows[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Username/email or password is incorrect',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Update last seen
    await query(
      'UPDATE users SET last_seen = CURRENT_TIMESTAMP, is_online = 1 WHERE id = ?',
      [user.id]
    );

    // Get Signal keys
    const signalKeysResult = await query(
      'SELECT identity_key_public, identity_key_private, registration_id FROM signal_keys WHERE user_id = ?',
      [user.id]
    );

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);
    await saveRefreshToken(user.id, refreshToken);

    // Remove password hash from response
    delete user.password_hash;

    res.json({
      accessToken,
      refreshToken,
      expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
      user,
      signalKeys: signalKeysResult.rows.length > 0 ? {
        identityKey: {
          publicKey: signalKeysResult.rows[0].identity_key_public,
          privateKey: signalKeysResult.rows[0].identity_key_private
        },
        registrationId: signalKeysResult.rows[0].registration_id
      } : null
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'Failed to authenticate user',
      code: 'LOGIN_ERROR'
    });
  }
});

// Refresh token
router.post('/refresh', [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Invalid input data',
        details: errors.array(),
        code: 'VALIDATION_ERROR'
      });
    }

    const { refreshToken } = req.body;

    // Verify refresh token
    const userId = await verifyRefreshToken(refreshToken);

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(userId);
    
    // Revoke old refresh token and save new one
    await revokeRefreshToken(refreshToken);
    await saveRefreshToken(userId, newRefreshToken);

    res.json({
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: 7 * 24 * 60 * 60 // 7 days in seconds
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      error: 'Token refresh failed',
      message: 'Invalid or expired refresh token',
      code: 'REFRESH_ERROR'
    });
  }
});

// Logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    // Update user status
    await query(
      'UPDATE users SET is_online = 0, last_seen = CURRENT_TIMESTAMP WHERE id = ?',
      [req.user.id]
    );

    // Revoke refresh token (if provided)
    if (req.body.refreshToken) {
      await revokeRefreshToken(req.body.refreshToken);
    }

    res.json({
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: 'Failed to logout user',
      code: 'LOGOUT_ERROR'
    });
  }
});

module.exports = router;
