const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { query } = require('../database/connection');

const router = express.Router();

// Create a new user (POST /api/v1/users)
router.post("/", async (req, res) => {
  try {
    const { id, username, email, firstName, lastName, phoneNumber, profilePicture } = req.body;
    
    console.log("🔄 Creating new user:", { id, username, email });
    
    // Check if username already exists
    if (username) {
      const existingUser = await query('SELECT id FROM users WHERE username = $1', [username]);
      if (existingUser.rows.length > 0) {
        console.log("⚠️ Username already exists:", username);
        return res.status(409).json({
          success: false,
          error: 'Username already exists',
          message: 'A user with this username already exists',
          code: 'USERNAME_ALREADY_EXISTS'
        });
      }
    }
    
    // Check if email already exists
    if (email) {
      const existingEmail = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existingEmail.rows.length > 0) {
        console.log("⚠️ Email already exists:", email);
        return res.status(409).json({
          success: false,
          error: 'Email already exists',
          message: 'A user with this email already exists',
          code: 'EMAIL_ALREADY_EXISTS'
        });
      }
    }
    
    // Always generate a proper UUID - handle undefined, null, or invalid IDs
    let userId;
    if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      userId = id; // Use provided valid UUID
      console.log("✅ Using provided UUID:", userId);
    } else {
      const { v4: uuidv4 } = require('uuid');
      userId = uuidv4(); // Generate new UUID for undefined/invalid IDs
      console.log("🔄 Generated new UUID for user:", userId);
    }
    
    // Generate a default password hash for users created via this endpoint
    const bcrypt = require('bcryptjs');
    const defaultPassword = `default_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const passwordHash = await bcrypt.hash(defaultPassword, 10);
    
    // Insert user into database
    const result = await query(`
      INSERT INTO users (id, username, email, first_name, last_name, phone_number, profile_picture, password_hash, is_online, last_seen)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, CURRENT_TIMESTAMP)
    `, [userId, username, email, firstName, lastName, phoneNumber, profilePicture, passwordHash]);
    
    console.log("✅ User created successfully:", userId);
    
    res.status(201).json({
      success: true,
      user: {
        id: userId,
        username: username,
        email: email,
        firstName: firstName,
        lastName: lastName,
        phoneNumber: phoneNumber,
        profilePicture: profilePicture,
        isOnline: true,
        lastSeen: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("❌ Error creating user:", error);
    
    // Handle specific database constraint violations
    if (error.code === '23505') { // PostgreSQL unique violation error code
      if (error.constraint === 'users_username_key') {
        return res.status(409).json({
          success: false,
          error: 'Username already exists',
          message: 'A user with this username already exists',
          code: 'USERNAME_ALREADY_EXISTS'
        });
      } else if (error.constraint === 'users_email_key') {
        return res.status(409).json({
          success: false,
          error: 'Email already exists',
          message: 'A user with this email already exists',
          code: 'EMAIL_ALREADY_EXISTS'
        });
      }
    }
    
    res.status(500).json({
      success: false,
      error: "Failed to create user",
      message: error.message
    });
  }
});

// Batch update user (PATCH /api/v1/users/batch-update)
router.patch("/batch-update", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;
    
    console.log("🔄 Batch updating user:", userId, "with updates:", Object.keys(updates));
    
    // Filter out protected fields
    const allowedFields = ['username', 'email', 'first_name', 'last_name', 'phone_number', 'profile_picture', 'bio', 'is_online', 'last_seen'];
    const filteredUpdates = {};
    
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key) && key !== 'id' && key !== 'created_at') {
        filteredUpdates[key] = updates[key];
      }
    });
    
    if (Object.keys(filteredUpdates).length === 0) {
      return res.status(400).json({
        success: false,
        error: "No valid fields to update"
      });
    }
    
    const updateFields = Object.keys(filteredUpdates)
      .map((key, index) => `${key} = $${index + 1}`);
    
    const updateValues = Object.values(filteredUpdates);
    updateValues.push(new Date(), userId);
    
    const queryText = `
      UPDATE users 
      SET ${updateFields.join(', ')}, updated_at = $${updateValues.length - 1}
      WHERE id = $${updateValues.length}
      RETURNING *
    `;
    
    const result = await query(queryText, updateValues);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }
    
    const updatedUser = result.rows[0];
    console.log("✅ User updated successfully:", userId);
    
    res.json({
      success: true,
      data: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        phoneNumber: updatedUser.phone_number,
        profilePicture: updatedUser.profile_picture,
        bio: updatedUser.bio,
        isOnline: updatedUser.is_online,
        lastSeen: updatedUser.last_seen,
        updatedAt: updatedUser.updated_at
      }
    });
  } catch (error) {
    console.error("❌ Error updating user:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update user",
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
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userResult = await query(
      'SELECT id, username, email, phone_number, first_name, last_name, bio, profile_picture, is_online, last_seen, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User profile not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = userResult.rows[0];
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      phoneNumber: user.phone_number,
      firstName: user.first_name,
      lastName: user.last_name,
      bio: user.bio,
      profilePicture: user.profile_picture,
      isOnline: user.is_online,
      lastSeen: user.last_seen,
      createdAt: user.created_at
    });
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
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { username, email, firstName, lastName, bio, profilePicture } = req.body;

    // Check if username is already taken by another user
    if (username) {
      const existingUser = await query(
        'SELECT id FROM users WHERE username = $1 AND id != $2',
        [username, req.user.id]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({
          error: 'Username already taken',
          message: 'Username is already in use by another user',
          code: 'USERNAME_TAKEN'
        });
      }
    }

    // Update user profile
    const result = await query(
      `UPDATE users SET 
        username = COALESCE($1, username),
        email = COALESCE($2, email),
        first_name = COALESCE($3, first_name),
        last_name = COALESCE($4, last_name),
        bio = COALESCE($5, bio),
        profile_picture = COALESCE($6, profile_picture),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [username, email, firstName, lastName, bio, profilePicture, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User profile not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      message: 'An error occurred while updating profile',
      code: 'PROFILE_UPDATE_ERROR'
    });
  }
});

// Search users (this should be before the /:userId route)
router.get('/search', authenticateToken, async (req, res) => {
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
      `SELECT id, username, email, first_name, last_name, bio, profile_picture, is_online, last_seen, created_at 
       FROM users 
       WHERE (username LIKE $1 OR first_name LIKE $2 OR last_name LIKE $3) AND id != $4
       LIMIT $5`,
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
router.get('/contacts', authenticateToken, async (req, res) => {
  try {
    const contactsResult = await query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.bio, u.profile_picture, u.is_online, u.last_seen, u.created_at
       FROM users u
       INNER JOIN user_contacts uc ON u.id = uc.contact_id
       WHERE uc.user_id = $1`,
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
router.post('/contacts/:contactId', authenticateToken, async (req, res) => {
  try {
    const { contactId } = req.params;

    // Check if contact exists
    const contactResult = await query(
      'SELECT id FROM users WHERE id = $1',
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
      'SELECT id FROM user_contacts WHERE user_id = $1 AND contact_id = $2',
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
      'INSERT INTO user_contacts (user_id, contact_id) VALUES ($1, $2)',
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
router.delete('/contacts/:contactId', authenticateToken, async (req, res) => {
  try {
    const { contactId } = req.params;

    await query(
      'DELETE FROM user_contacts WHERE user_id = $1 AND contact_id = $2',
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
router.post('/block/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const userResult = await query(
      'SELECT id FROM users WHERE id = $1',
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
      'SELECT id FROM user_blocked_users WHERE user_id = $1 AND blocked_user_id = $2',
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
      'INSERT INTO user_blocked_users (user_id, blocked_user_id) VALUES ($1, $2)',
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
router.delete('/block/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    await query(
      'DELETE FROM user_blocked_users WHERE user_id = $1 AND blocked_user_id = $2',
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

// Get user by ID
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if userId is a valid UUID
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      console.log('⚠️ Non-UUID format for user lookup:', userId);
      
      // Try to find user by email or username as fallback
      const fallbackResult = await query(
        'SELECT id, username, email, first_name, last_name, bio, profile_picture, is_online, last_seen, created_at FROM users WHERE email = $1 OR username = $1 LIMIT 1',
        [userId]
      );

      if (fallbackResult.rows.length > 0) {
        console.log('✅ Found user by fallback lookup:', userId);
        return res.json({
          user: fallbackResult.rows[0]
        });
      }

      return res.status(400).json({
        error: 'Invalid user ID format',
        message: 'User ID must be a valid UUID format or existing email/username',
        code: 'INVALID_USER_ID_FORMAT'
      });
    }

    const userResult = await query(
      'SELECT id, username, email, first_name, last_name, bio, profile_picture, is_online, last_seen, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Return user data in the format expected by frontend
    res.json({
      user: userResult.rows[0]
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Failed to get user',
      message: 'An error occurred while fetching user',
      code: 'USER_FETCH_ERROR'
    });
  }
});

// Update user by ID (PUT /api/v1/users/:userId)
router.put("/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    
    console.log("🔄 Updating user:", userId, "with updates:", updates);
    
    // Handle empty phone numbers - convert to NULL
    if (updates.phoneNumber === '') {
      updates.phoneNumber = null;
    }
    
    // Check if userId is a valid UUID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    
    let whereClause, queryParams;
    
    if (isUUID) {
      // Use UUID for lookup
      whereClause = 'WHERE id = $8';
      queryParams = [updates.username, updates.email, updates.firstName, updates.lastName, updates.phoneNumber, updates.profilePicture, updates.bio, userId];
    } else {
      // Use email for lookup
      whereClause = 'WHERE email = $8';
      queryParams = [updates.username, updates.email, updates.firstName, updates.lastName, updates.phoneNumber, updates.profilePicture, updates.bio, userId];
    }
    
    // Update user in database
    const result = await query(`
      UPDATE users SET 
        username = COALESCE($1, username),
        email = COALESCE($2, email),
        first_name = COALESCE($3, first_name),
        last_name = COALESCE($4, last_name),
        phone_number = COALESCE($5, phone_number),
        profile_picture = COALESCE($6, profile_picture),
        bio = COALESCE($7, bio),
        updated_at = CURRENT_TIMESTAMP
      ${whereClause}
    `, queryParams);
    
    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found",
        message: "User with specified ID/email not found"
      });
    }
    
    console.log("✅ User updated successfully:", userId);
    
    res.json({
      success: true,
      message: "User updated successfully",
      userId: userId
    });
  } catch (error) {
    console.error("❌ Error updating user:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update user",
      message: error.message
    });
  }
});

// Get user contacts
router.get('/contacts', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT u.id, u.username, u.first_name, u.last_name, u.profile_picture, 
             u.is_online, u.last_seen, u.bio, u.phone_number, u.email
      FROM user_contacts uc
      INNER JOIN users u ON uc.contact_id = u.id
      WHERE uc.user_id = $1
      ORDER BY u.first_name, u.last_name
    `, [req.user.id]);

    const contacts = result.rows.map(row => ({
      id: row.id,
      username: row.username,
      firstName: row.first_name,
      lastName: row.last_name,
      profilePicture: row.profile_picture,
      isOnline: row.is_online,
      lastSeen: row.last_seen,
      bio: row.bio,
      phoneNumber: row.phone_number,
      email: row.email
    }));

    res.json({
      success: true,
      contacts: contacts
    });

  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({
      error: 'Failed to fetch contacts',
      message: 'An error occurred while fetching contacts',
      code: 'CONTACTS_FETCH_ERROR'
    });
  }
});

// Add contact
router.post('/contacts/:contactId', authenticateToken, async (req, res) => {
  try {
    const { contactId } = req.params;
    const userId = req.user.id;

    // Check if contact exists
    const contactCheck = await query(
      'SELECT id FROM users WHERE id = $1',
      [contactId]
    );

    if (contactCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Contact not found',
        message: 'The specified user does not exist',
        code: 'CONTACT_NOT_FOUND'
      });
    }

    // Check if already in contacts
    const existingContact = await query(
      'SELECT id FROM user_contacts WHERE user_id = $1 AND contact_id = $2',
      [userId, contactId]
    );

    if (existingContact.rows.length > 0) {
      return res.status(409).json({
        error: 'Contact already exists',
        message: 'This user is already in your contacts',
        code: 'CONTACT_ALREADY_EXISTS'
      });
    }

    // Add to contacts
    await query(
      'INSERT INTO user_contacts (user_id, contact_id) VALUES ($1, $2)',
      [userId, contactId]
    );

    res.status(201).json({
      success: true,
      message: 'Contact added successfully'
    });

  } catch (error) {
    console.error('Add contact error:', error);
    res.status(500).json({
      error: 'Failed to add contact',
      message: 'An error occurred while adding contact',
      code: 'CONTACT_ADD_ERROR'
    });
  }
});

// Remove contact
router.delete('/contacts/:contactId', authenticateToken, async (req, res) => {
  try {
    const { contactId } = req.params;
    const userId = req.user.id;

    const result = await query(
      'DELETE FROM user_contacts WHERE user_id = $1 AND contact_id = $2',
      [userId, contactId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: 'Contact not found',
        message: 'This user is not in your contacts',
        code: 'CONTACT_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: 'Contact removed successfully'
    });

  } catch (error) {
    console.error('Remove contact error:', error);
    res.status(500).json({
      error: 'Failed to remove contact',
      message: 'An error occurred while removing contact',
      code: 'CONTACT_REMOVE_ERROR'
    });
  }
});

module.exports = router;
