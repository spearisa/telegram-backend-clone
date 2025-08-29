const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { query } = require('../database/connection');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Get user's chats
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT c.id, c.type, c.title, c.description, c.is_group, c.member_count, c.created_at,
             c.last_message_at, c.last_message_content, c.last_message_sender_id,
             u.username as last_message_sender_username, u.first_name as last_message_sender_first_name
      FROM chats c
      INNER JOIN chat_participants cp ON c.id = cp.chat_id
      LEFT JOIN users u ON c.last_message_sender_id = u.id
      WHERE cp.user_id = $1
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
    `, [req.user.id]);

    const chats = result.rows.map(row => ({
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      isGroup: row.is_group,
      memberCount: row.member_count,
      createdAt: row.created_at,
      lastMessageAt: row.last_message_at,
      lastMessageContent: row.last_message_content,
      lastMessageSender: row.last_message_sender_id ? {
        id: row.last_message_sender_id,
        username: row.last_message_sender_username,
        firstName: row.last_message_sender_first_name
      } : null
    }));

    res.json({
      success: true,
      chats: chats
    });

  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({
      error: 'Failed to fetch chats',
      message: 'An error occurred while fetching chats',
      code: 'CHATS_FETCH_ERROR'
    });
  }
});

// Create new private chat
router.post('/', [
  body('participantId')
    .notEmpty()
    .withMessage('Participant ID is required')
], authenticateToken, async (req, res) => {
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

    const { participantId } = req.body;

    // Check if participant exists
    const participantCheck = await query(
      'SELECT id FROM users WHERE id = $1',
      [participantId]
    );

    if (participantCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Participant not found',
        message: 'User not found',
        code: 'PARTICIPANT_NOT_FOUND'
      });
    }

    // Check if chat already exists between these users
    const existingChat = await query(`
      SELECT c.id FROM chats c
      INNER JOIN chat_participants cp1 ON c.id = cp1.chat_id
      INNER JOIN chat_participants cp2 ON c.id = cp2.chat_id
      WHERE c.is_group = false 
        AND cp1.user_id = $1 AND cp2.user_id = $2
        AND cp1.user_id != cp2.user_id
    `, [req.user.id, participantId]);

    if (existingChat.rows.length > 0) {
      return res.status(409).json({
        error: 'Chat already exists',
        message: 'A private chat already exists with this user',
        code: 'CHAT_ALREADY_EXISTS',
        chatId: existingChat.rows[0].id
      });
    }

    // Create new private chat
    const chatId = uuidv4();
    await query(`
      INSERT INTO chats (id, type, is_group, member_count)
      VALUES ($1, 'private', false, 2)
    `, [chatId]);

    // Add both users as participants
    await query(`
      INSERT INTO chat_participants (chat_id, user_id, role)
      VALUES ($1, $2, 'member'), ($1, $3, 'member')
    `, [chatId, req.user.id, participantId]);

    // Get participant info for response
    const participantInfo = await query(
      'SELECT id, username, first_name, last_name, profile_picture FROM users WHERE id = $1',
      [participantId]
    );

    res.status(201).json({
      success: true,
      message: 'Private chat created successfully',
      chat: {
        id: chatId,
        type: 'private',
        isGroup: false,
        memberCount: 2,
        participant: participantInfo.rows[0]
      }
    });

  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({
      error: 'Failed to create chat',
      message: 'An error occurred while creating chat',
      code: 'CHAT_CREATE_ERROR'
    });
  }
});

// Get chat details
router.get('/:chatId', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;

    // Check if user is participant in this chat
    const participantCheck = await query(
      'SELECT id FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, req.user.id]
    );

    if (participantCheck.rows.length === 0) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a participant in this chat',
        code: 'ACCESS_DENIED'
      });
    }

    // Get chat details
    const chatResult = await query(`
      SELECT c.id, c.type, c.title, c.description, c.is_group, c.member_count, 
             c.created_at, c.creator_id
      FROM chats c
      WHERE c.id = $1
    `, [chatId]);

    if (chatResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Chat not found',
        message: 'Chat does not exist',
        code: 'CHAT_NOT_FOUND'
      });
    }

    const chat = chatResult.rows[0];

    // Get participants
    const participantsResult = await query(`
      SELECT u.id, u.username, u.first_name, u.last_name, u.profile_picture, 
             u.is_online, u.last_seen, cp.role, cp.joined_at
      FROM chat_participants cp
      INNER JOIN users u ON cp.user_id = u.id
      WHERE cp.chat_id = $1
      ORDER BY cp.joined_at ASC
    `, [chatId]);

    const participants = participantsResult.rows.map(row => ({
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
      chat: {
        id: chat.id,
        type: chat.type,
        title: chat.title,
        description: chat.description,
        isGroup: chat.is_group,
        memberCount: chat.member_count,
        createdAt: chat.created_at,
        creatorId: chat.creator_id,
        participants: participants
      }
    });

  } catch (error) {
    console.error('Get chat details error:', error);
    res.status(500).json({
      error: 'Failed to fetch chat details',
      message: 'An error occurred while fetching chat details',
      code: 'CHAT_DETAILS_FETCH_ERROR'
    });
  }
});

// Update chat (for groups)
router.put('/:chatId', [
  body('title')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Title must be 100 characters or less'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must be 500 characters or less')
], authenticateToken, async (req, res) => {
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

    const { chatId } = req.params;
    const { title, description } = req.body;

    // Check if user is admin of this chat
    const adminCheck = await query(
      'SELECT id FROM chat_participants WHERE chat_id = $1 AND user_id = $2 AND role = $3',
      [chatId, req.user.id, 'admin']
    );

    if (adminCheck.rows.length === 0) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only admins can update chat details',
        code: 'ACCESS_DENIED'
      });
    }

    // Update chat
    const updateResult = await query(`
      UPDATE chats 
      SET title = COALESCE($1, title), 
          description = COALESCE($2, description),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING id, title, description, updated_at
    `, [title, description, chatId]);

    res.json({
      success: true,
      message: 'Chat updated successfully',
      data: updateResult.rows[0]
    });

  } catch (error) {
    console.error('Update chat error:', error);
    res.status(500).json({
      error: 'Failed to update chat',
      message: 'An error occurred while updating chat',
      code: 'CHAT_UPDATE_ERROR'
    });
  }
});

module.exports = router;
