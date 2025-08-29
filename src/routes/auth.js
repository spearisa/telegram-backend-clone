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

// Firebase login endpoint
router.post('/firebase-login', async (req, res) => {
  try {
    const { firebaseIdToken, userData } = req.body;
    
    console.log('🔄 Firebase login attempt:', { 
      hasToken: !!firebaseIdToken, 
      userData: userData ? { uid: userData.uid, email: userData.email } : null 
    });

    // Validate input
    if (!firebaseIdToken || !userData) {
      return res.status(400).json({
        error: 'Missing required data',
        message: 'Firebase ID token and user data are required',
        code: 'MISSING_DATA'
      });
    }

    // For now, we'll trust the Firebase token from the frontend
    // In production, you should verify it with Firebase Admin SDK
    // const decodedToken = await admin.auth().verifyIdToken(firebaseIdToken);
    
    const { uid, email, displayName, photoURL } = userData;
    
    // Ensure we have required data
    if (!uid || !email) {
      return res.status(400).json({
        error: 'Invalid user data',
        message: 'User ID and email are required',
        code: 'INVALID_USER_DATA'
      });
    }

    // Generate username from display name or email
    const username = displayName || email.split('@')[0];
    const firstName = displayName ? displayName.split(' ')[0] : username;
    const lastName = displayName ? displayName.split(' ').slice(1).join(' ') : '';
    const profilePicture = photoURL || null;

    // Generate a secure password hash for Firebase users (they don't use passwords)
    const tempPassword = `firebase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1 OR firebase_uid = $2',
      [email, uid]
    );

    let finalUserId;
    if (existingUser.rows.length > 0) {
      // User exists, use their existing UUID
      finalUserId = existingUser.rows[0].id;
    } else {
      // Generate new UUID for new user
      finalUserId = uuidv4();
    }

    if (existingUser.rows.length > 0) {
      // User exists, update their information
      const user = existingUser.rows[0];
      finalUserId = user.id;
      
      await query(
        `UPDATE users SET 
          username = COALESCE($1, username),
          first_name = COALESCE($2, first_name),
          last_name = COALESCE($3, last_name),
          profile_picture = COALESCE($4, profile_picture),
          is_online = true,
          last_seen = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [username, firstName, lastName, profilePicture, finalUserId]
      );
    } else {
      // Create new user with valid email and password hash
      await query(
        `INSERT INTO users (
          id, username, email, first_name, last_name, profile_picture, password_hash, firebase_uid, is_online, last_seen
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, CURRENT_TIMESTAMP)`,
        [finalUserId, username, email, firstName, lastName, profilePicture, passwordHash, uid]
      );

      // Generate Signal keys for new user
      try {
        const signalKeys = generateSignalKeys();
        if (signalKeys && signalKeys.identityKey && signalKeys.identityKey.publicKey) {
          await query(
            `INSERT INTO signal_keys (
              user_id, identity_key_public, identity_key_private, registration_id
            ) VALUES ($1, $2, $3, $4)`,
            [finalUserId, signalKeys.identityKey.publicKey, signalKeys.identityKey.privateKey, signalKeys.registrationId]
          );
          console.log('✅ Signal keys generated for user:', finalUserId);
        } else {
          console.warn('⚠️ Signal keys generated but missing required properties');
        }
      } catch (signalError) {
        console.warn('⚠️ Signal key generation failed, continuing without keys:', signalError.message);
        // Continue without Signal keys - this is not critical for basic functionality
      }
    }

    // Generate JWT tokens
    const { accessToken, refreshToken } = generateTokens(finalUserId);

    // Save refresh token
    await saveRefreshToken(finalUserId, refreshToken);

    // Get updated user data
    const userResult = await query(
      'SELECT id, username, email, first_name, last_name, bio, profile_picture, created_at FROM users WHERE id = $1',
      [finalUserId]
    );

    console.log('✅ Firebase login successful for user:', finalUserId);

    res.json({
      success: true,
      message: 'Firebase login successful',
      user: userResult.rows[0],
      accessToken,
      refreshToken,
      expiresIn: 604800 // 7 days
    });

  } catch (error) {
    console.error('Firebase login error:', error);
    res.status(500).json({
      error: 'Firebase login failed',
      message: 'An error occurred during Firebase login',
      code: 'FIREBASE_LOGIN_ERROR'
    });
  }
});

// Original working registration - accepts all fields
router.post('/register', [
  body('username')
    .optional()
    .isLength({ min: 3, max: 30 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username must be 3-30 characters, alphanumeric and underscore only'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Must be a valid email address'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('phoneNumber')
    .optional()
    .matches(/^[\+]?[1-9][\d]{0,15}$/)
    .withMessage('Phone number must be valid (e.g., +1234567890 or 1234567890)'),
  body('firstName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('First name must be 50 characters or less'),
  body('lastName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Last name must be 50 characters or less')
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
      'SELECT id FROM users WHERE email = $1 OR (username = $2 AND username IS NOT NULL) OR (phone_number = $3 AND phone_number IS NOT NULL)',
      [email, username, phoneNumber]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'Email, username, or phone number already registered',
        code: 'USER_EXISTS'
      });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user with all fields
    const userId = uuidv4();
    await query(
      `INSERT INTO users (
        id, username, email, phone_number, password_hash, 
        first_name, last_name, profile_picture
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, username, email, phoneNumber, passwordHash, firstName, lastName, profilePicture]
    );

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(userId);
    await saveRefreshToken(userId, refreshToken);

    // Get user data
    const userResult = await query(
      'SELECT id, username, email, first_name, last_name, bio, profile_picture, created_at FROM users WHERE id = $1',
      [userId]
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: userResult.rows[0],
      accessToken,
      refreshToken,
      expiresIn: 7 * 24 * 60 * 60 // 7 days in seconds
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
      'SELECT id, username, email, password_hash, first_name, last_name, bio, profile_picture FROM users WHERE username = $1 OR email = $2',
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
      'UPDATE users SET last_seen = CURRENT_TIMESTAMP, is_online = true WHERE id = $1',
      [user.id]
    );

    // Get Signal keys
    const signalKeysResult = await query(
      'SELECT identity_key_public, identity_key_private, registration_id FROM signal_keys WHERE user_id = $1',
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
