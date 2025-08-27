const express = require('express');
const { body, validationResult } = require('express-validator');
const { verifyFirebaseToken } = require('../middleware/auth');
const { query } = require('../database/connection');

const router = express.Router();


// Create a new user (POST /api/v1/users)
router.post("/", async (req, res) => {
  try {
    const { id, username, email, firstName, lastName, phoneNumber, profilePicture } = req.body;
    
    console.log("🔄 Creating new user:", { id, username, email });
    
    // Insert user into database
    const result = await query(`
      INSERT INTO users (id, username, email, first_name, last_name, phone_number, profile_picture, is_online, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, true, CURRENT_TIMESTAMP)
    `, [id, username, email, firstName, lastName, phoneNumber, profilePicture]);
    
    console.log("✅ User created successfully:", id);
    
    res.status(201).json({
      success: true,
      user: {
        id: id,
        username: username,
        email: email,
        firstName: firstName,
        lastName: lastName,
        phoneNumber: phoneNumber,
        profilePicture: profilePicture,
        isOnline: true,
        lastSeen: new Date()
      }
    });
  } catch (error) {
    console.error("❌ Error creating user:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create user",
      message: error.message
    });
  }
});

// Get all users (GET /api/v1/users)
router.get("/", async (req, res) => {
  try {
    console.log("🔄 Fetching all users...");
    
    const result = await query(`
      SELECT id, username, email, first_name, last_name, phone_number, profile_picture, is_online, last_seen, created_at
      FROM users
      ORDER BY created_at DESC
    `);
    
    const users = result.rows.map(row => ({
      id: row.id,
      username: row.username,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      phoneNumber: row.phone_number,
      profilePicture: row.profile_picture,
      isOnline: row.is_online,
      lastSeen: row.last_seen,
      createdAt: row.created_at
    }));
    
    console.log("✅ Fetched users:", users.length);
    
    res.json({
      success: true,
      users: users
    });
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch users",
      message: error.message
    });
  }
});
// Get user profile
router.get('/profile', verifyFirebaseToken, async (req, res) => {
  try {
    const userResult = await query(
      'SELECT id, username, email, phone_number, first_name, last_name, bio, profile_picture, is_online, last_seen, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User profile not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json(userResult.rows[0]);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Failed to get profile',
      message: 'An error occurred while fetching profile',
      code: 'PROFILE_FETCH_ERROR'
    });
  }
});

// Update user profile
router.put('/profile', [
  body('firstName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('First name must be 50 characters or less'),
  body('lastName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Last name must be 50 characters or less'),
  body('bio')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Bio must be 200 characters or less'),
  body('profilePicture')
    .optional()
    .isURL()
    .withMessage('Profile picture must be a valid URL')
], verifyFirebaseToken, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Invalid input data',
        details: errors.array(),
        code: 'VALIDATION_ERROR'
      });
    }

    const { firstName, lastName, bio, profilePicture } = req.body;

    // Update user profile
    await query(
      `UPDATE users 
       SET first_name = ?, last_name = ?, bio = ?, profile_picture = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [firstName, lastName, bio, profilePicture, req.user.id]
    );

    // Get updated profile
    const userResult = await query(
      'SELECT id, username, email, phone_number, first_name, last_name, bio, profile_picture, is_online, last_seen, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    res.json({
      message: 'Profile updated successfully',
      user: userResult.rows[0]
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      message: 'An error occurred while updating profile',
      code: 'PROFILE_UPDATE_ERROR'
    });
  }
});

// Get user by ID
router.get('/:userId', verifyFirebaseToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const userResult = await query(
      'SELECT id, username, first_name, last_name, bio, profile_picture, is_online, last_seen, created_at FROM users WHERE id = ?',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json(userResult.rows[0]);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Failed to get user',
      message: 'An error occurred while fetching user',
      code: 'USER_FETCH_ERROR'
    });
  }
});

// Search users (this should be before the /:userId route)
router.get('/search', verifyFirebaseToken, async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        error: 'Search query required',
        message: 'Search query must be at least 2 characters long',
        code: 'INVALID_SEARCH_QUERY'
      });
    }

    const searchQuery = `%${q.trim()}%`;
    const userResult = await query(
      `SELECT id, username, first_name, last_name, bio, profile_picture, is_online, last_seen, created_at 
       FROM users 
       WHERE (username LIKE ? OR first_name LIKE ? OR last_name LIKE ?) AND id != ?
       LIMIT ?`,
      [searchQuery, searchQuery, searchQuery, req.user.id, parseInt(limit)]
    );

    res.json({
      users: userResult.rows,
      total: userResult.rows.length,
      query: q.trim()
    });
  } catch (error) {
    console.error('User search error:', error);
    res.status(500).json({
      error: 'Failed to search users',
      message: 'An error occurred while searching users',
      code: 'USER_SEARCH_ERROR'
    });
  }
});

// Get user contacts
router.get('/contacts', verifyFirebaseToken, async (req, res) => {
  try {
    const contactsResult = await query(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.bio, u.profile_picture, u.is_online, u.last_seen, u.created_at
       FROM users u
       INNER JOIN user_contacts uc ON u.id = uc.contact_id
       WHERE uc.user_id = ?`,
      [req.user.id]
    );

    res.json({
      contacts: contactsResult.rows,
      total: contactsResult.rows.length
    });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({
      error: 'Failed to get contacts',
      message: 'An error occurred while fetching contacts',
      code: 'CONTACTS_FETCH_ERROR'
    });
  }
});

// Add contact
router.post('/contacts/:contactId', verifyFirebaseToken, async (req, res) => {
  try {
    const { contactId } = req.params;

    // Check if contact exists
    const contactResult = await query(
      'SELECT id FROM users WHERE id = ?',
      [contactId]
    );

    if (contactResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Contact not found',
        message: 'User not found',
        code: 'CONTACT_NOT_FOUND'
      });
    }

    // Check if already a contact
    const existingContact = await query(
      'SELECT id FROM user_contacts WHERE user_id = ? AND contact_id = ?',
      [req.user.id, contactId]
    );

    if (existingContact.rows.length > 0) {
      return res.status(409).json({
        error: 'Contact already exists',
        message: 'User is already in your contacts',
        code: 'CONTACT_ALREADY_EXISTS'
      });
    }

    // Add contact
    await query(
      'INSERT INTO user_contacts (user_id, contact_id) VALUES (?, ?)',
      [req.user.id, contactId]
    );

    res.json({
      message: 'Contact added successfully',
      contactId
    });
  } catch (error) {
    console.error('Add contact error:', error);
    res.status(500).json({
      error: 'Failed to add contact',
      message: 'An error occurred while adding contact',
      code: 'ADD_CONTACT_ERROR'
    });
  }
});

// Remove contact
router.delete('/contacts/:contactId', verifyFirebaseToken, async (req, res) => {
  try {
    const { contactId } = req.params;

    await query(
      'DELETE FROM user_contacts WHERE user_id = ? AND contact_id = ?',
      [req.user.id, contactId]
    );

    res.json({
      message: 'Contact removed successfully',
      contactId
    });
  } catch (error) {
    console.error('Remove contact error:', error);
    res.status(500).json({
      error: 'Failed to remove contact',
      message: 'An error occurred while removing contact',
      code: 'REMOVE_CONTACT_ERROR'
    });
  }
});

// Block user
router.post('/block/:userId', verifyFirebaseToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const userResult = await query(
      'SELECT id FROM users WHERE id = ?',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Check if already blocked
    const existingBlock = await query(
      'SELECT id FROM user_blocked_users WHERE user_id = ? AND blocked_user_id = ?',
      [req.user.id, userId]
    );

    if (existingBlock.rows.length > 0) {
      return res.status(409).json({
        error: 'User already blocked',
        message: 'User is already blocked',
        code: 'USER_ALREADY_BLOCKED'
      });
    }

    // Block user
    await query(
      'INSERT INTO user_blocked_users (user_id, blocked_user_id) VALUES (?, ?)',
      [req.user.id, userId]
    );

    res.json({
      message: 'User blocked successfully',
      userId
    });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({
      error: 'Failed to block user',
      message: 'An error occurred while blocking user',
      code: 'BLOCK_USER_ERROR'
    });
  }
});

// Unblock user
router.delete('/block/:userId', verifyFirebaseToken, async (req, res) => {
  try {
    const { userId } = req.params;

    await query(
      'DELETE FROM user_blocked_users WHERE user_id = ? AND blocked_user_id = ?',
      [req.user.id, userId]
    );

    res.json({
      message: 'User unblocked successfully',
      userId
    });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({
      error: 'Failed to unblock user',
      message: 'An error occurred while unblocking user',
      code: 'UNBLOCK_USER_ERROR'
    });
  }
});

module.exports = router;
