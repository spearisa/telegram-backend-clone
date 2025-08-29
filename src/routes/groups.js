const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { query } = require('../database/connection');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Get user's groups
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT c.id, c.type, c.title, c.description, c.is_group, c.member_count, c.created_at
      FROM chats c
      INNER JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE cp.user_id = $1 AND c.is_group = true
      ORDER BY c.created_at DESC
    `, [req.user.id]);

    const groups = result.rows.map(row => ({
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      isGroup: row.is_group,
      memberCount: row.member_count,
      createdAt: row.created_at
    }));

    res.json({
      success: true,
      groups: groups
    });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({
      error: 'Failed to fetch groups',
      message: 'An error occurred while fetching groups'
    });
  }
});

// Create new group
router.post('/', [
  body('title')
    .notEmpty()
    .withMessage('Group title is required'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must be 500 characters or less'),
  body('participantIds')
    .isArray({ min: 1 })
    .withMessage('At least one participant is required')
], authenticateToken, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Invalid input data',
        details: errors.array()
      });
    }

    const { title, description, participantIds } = req.body;
    const groupId = uuidv4();

    // Create group chat
    await query(`
      INSERT INTO chats (id, type, title, description, is_group, creator_id, member_count)
      VALUES ($1, 'group', $2, $3, true, $4, $5)
    `, [groupId, title, description, req.user.id, participantIds.length + 1]);

    // Add creator as participant
    await query(`
      INSERT INTO chat_participants (chat_id, user_id, role)
      VALUES ($1, $2, 'admin')
    `, [groupId, req.user.id]);

    // Add other participants
    for (const participantId of participantIds) {
      await query(`
        INSERT INTO chat_participants (chat_id, user_id, role)
        VALUES ($1, $2, 'member')
      `, [groupId, participantId]);
    }

    res.status(201).json({
      success: true,
      message: 'Group created successfully',
      group: {
        id: groupId,
        title: title,
        description: description,
        memberCount: participantIds.length + 1
      }
    });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({
      error: 'Failed to create group',
      message: 'An error occurred while creating the group'
    });
  }
});

// Get group details
router.get('/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;

    // Check if user is member of the group
    const memberCheck = await query(`
      SELECT 1 FROM chat_participants 
      WHERE chat_id = $1 AND user_id = $2
    `, [groupId, req.user.id]);

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a member of this group'
      });
    }

    const result = await query(`
      SELECT c.id, c.type, c.title, c.description, c.is_group, c.member_count, c.created_at,
             u.username as creator_username
      FROM chats c
      LEFT JOIN users u ON c.creator_id = u.id
      WHERE c.id = $1 AND c.is_group = true
    `, [groupId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Group not found',
        message: 'Group does not exist'
      });
    }

    const group = result.rows[0];
    res.json({
      success: true,
      group: {
        id: group.id,
        type: group.type,
        title: group.title,
        description: group.description,
        isGroup: group.is_group,
        memberCount: group.member_count,
        createdAt: group.created_at,
        creatorUsername: group.creator_username
      }
    });
  } catch (error) {
    console.error('Get group details error:', error);
    res.status(500).json({
      error: 'Failed to fetch group details',
      message: 'An error occurred while fetching group details'
    });
  }
});

// Get group members
router.get('/:groupId/members', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;

    // Check if user is member of the group
    const memberCheck = await query(`
      SELECT 1 FROM chat_participants 
      WHERE chat_id = $1 AND user_id = $2
    `, [groupId, req.user.id]);

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a member of this group'
      });
    }

    const result = await query(`
      SELECT u.id, u.username, u.first_name, u.last_name, u.profile_picture, u.is_online, u.last_seen,
             cp.role, cp.joined_at
      FROM chat_participants cp
      INNER JOIN users u ON cp.user_id = u.id
      WHERE cp.chat_id = $1
      ORDER BY cp.joined_at ASC
    `, [groupId]);

    const members = result.rows.map(row => ({
      id: row.id,
      username: row.username,
      firstName: row.first_name,
      lastName: row.last_name,
      profilePicture: row.profile_picture,
      isOnline: row.is_online,
      lastSeen: row.last_seen,
      role: row.role,
      joinedAt: row.joined_at
    }));

    res.json({
      success: true,
      members: members
    });
  } catch (error) {
    console.error('Get group members error:', error);
    res.status(500).json({
      error: 'Failed to fetch group members',
      message: 'An error occurred while fetching group members'
    });
  }
});

// Add member to group
router.post('/:groupId/members', [
  body('userId')
    .notEmpty()
    .withMessage('User ID is required')
], authenticateToken, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Invalid input data',
        details: errors.array()
      });
    }

    const { groupId } = req.params;
    const { userId } = req.body;

    // Check if user is admin of the group
    const adminCheck = await query(`
      SELECT 1 FROM chat_participants 
      WHERE chat_id = $1 AND user_id = $2 AND role = 'admin'
    `, [groupId, req.user.id]);

    if (adminCheck.rows.length === 0) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only group admins can add members'
      });
    }

    // Check if user is already a member
    const existingMember = await query(`
      SELECT 1 FROM chat_participants 
      WHERE chat_id = $1 AND user_id = $2
    `, [groupId, userId]);

    if (existingMember.rows.length > 0) {
      return res.status(409).json({
        error: 'User already member',
        message: 'User is already a member of this group'
      });
    }

    // Add member
    await query(`
      INSERT INTO chat_participants (chat_id, user_id, role)
      VALUES ($1, $2, 'member')
    `, [groupId, userId]);

    // Update member count
    await query(`
      UPDATE chats 
      SET member_count = member_count + 1 
      WHERE id = $1
    `, [groupId]);

    res.status(201).json({
      success: true,
      message: 'Member added successfully'
    });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({
      error: 'Failed to add member',
      message: 'An error occurred while adding member'
    });
  }
});

module.exports = router;
