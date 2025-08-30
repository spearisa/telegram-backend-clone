const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { query } = require('../database/connection');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Get chat messages
router.get('/:chatId', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    console.log('🔄 Fetching messages for chat:', chatId);
    
    // First check if the chat exists
    const chatCheck = await query('SELECT id FROM chats WHERE id = $1', [chatId]);
    if (chatCheck.rows.length === 0) {
      console.log('⚠️ Chat not found, returning empty messages');
      return res.json({ 
        success: true, 
        messages: [], 
        pagination: { 
          total: 0, 
          limit: parseInt(limit), 
          offset: parseInt(offset), 
          hasMore: false 
        } 
      });
    }

    // Check if user is participant in this chat
    const participantCheck = await query(
      'SELECT id FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [chatId, req.user.id]
    );

    if (participantCheck.rows.length === 0) {
      console.log('⚠️ User not participant in chat, returning empty messages');
      return res.json({ 
        success: true, 
        messages: [], 
        pagination: { 
          total: 0, 
          limit: parseInt(limit), 
          offset: parseInt(offset), 
          hasMore: false 
        } 
      });
    }

    // Get messages with pagination
    const messagesResult = await query(`
      SELECT m.id, m.content, m.message_type, m.sender_id, m.created_at, m.updated_at,
             u.username, u.first_name, u.last_name, u.profile_picture
      FROM messages m
      INNER JOIN users u ON m.sender_id = u.id
      WHERE m.chat_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2 OFFSET $3
    `, [chatId, parseInt(limit), parseInt(offset)]);

    const messages = messagesResult.rows.map(row => ({
      id: row.id,
      content: row.content,
      type: row.message_type,
      senderId: row.sender_id,
      sender: {
        id: row.sender_id,
        username: row.username,
        firstName: row.first_name,
        lastName: row.last_name,
        profilePicture: row.profile_picture
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    // Get total message count
    const countResult = await query(
      'SELECT COUNT(*) as total FROM messages WHERE chat_id = $1',
      [chatId]
    );

    console.log('✅ Found messages:', messages.length);
    res.json({
      success: true,
      messages: messages.reverse(), // Return in chronological order
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(countResult.rows[0].total) > parseInt(offset) + messages.length
      }
    });

  } catch (error) {
    console.error('Get messages error:', error);
    // Handle UUID validation errors gracefully
    if (error.message && error.message.includes('invalid input syntax for type uuid')) {
      console.log('⚠️ Invalid UUID format, returning empty messages');
      return res.json({ 
        success: true, 
        messages: [], 
        pagination: { 
          total: 0, 
          limit: parseInt(req.query.limit || 50), 
          offset: parseInt(req.query.offset || 0), 
          hasMore: false 
        } 
      });
    }
    res.status(500).json({
      error: 'Failed to fetch messages',
      message: 'An error occurred while fetching messages',
      code: 'MESSAGES_FETCH_ERROR'
    });
  }
});

// Send message
router.post('/:chatId', [
  body('content')
    .notEmpty()
    .withMessage('Message content is required')
    .isLength({ max: 4000 })
    .withMessage('Message content must be 4000 characters or less'),
  body('type')
    .optional()
    .isIn(['text', 'image', 'video', 'audio', 'file', 'location'])
    .withMessage('Invalid message type')
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
    const { content, type = 'text', recipientId } = req.body;

    console.log('🔄 Sending message to chat:', chatId, 'recipientId:', recipientId);

    // Check if chat exists, create if needed
    let chatCheck = await query(
      'SELECT id FROM chats WHERE id = $1',
      [chatId]
    );

    if (chatCheck.rows.length === 0 && recipientId) {
      console.log('⚠️ Chat not found, creating new chat with recipient:', recipientId);
      
      // Check if recipient exists
      const recipientCheck = await query(
        'SELECT id FROM users WHERE id = $1',
        [recipientId]
      );

      if (recipientCheck.rows.length === 0) {
        return res.status(404).json({
          error: 'Recipient not found',
          message: 'The specified recipient does not exist',
          code: 'RECIPIENT_NOT_FOUND'
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
      `, [req.user.id, recipientId]);

      if (existingChat.rows.length > 0) {
        // Use existing chat
        chatCheck = { rows: [{ id: existingChat.rows[0].id }] };
        console.log('✅ Found existing chat:', existingChat.rows[0].id);
      } else {
        // Create new private chat
        const newChatId = uuidv4();
        await query(`
          INSERT INTO chats (id, type, is_group, member_count)
          VALUES ($1, 'private', false, 2)
        `, [newChatId]);

        // Add both users as participants
        await query(`
          INSERT INTO chat_participants (chat_id, user_id, role)
          VALUES ($1, $2, 'member'), ($1, $3, 'member')
        `, [newChatId, req.user.id, recipientId]);

        chatCheck = { rows: [{ id: newChatId }] };
        console.log('✅ Created new chat:', newChatId);
      }
    }

    if (chatCheck.rows.length === 0) {
      console.log('⚠️ Chat not found and no recipient provided:', chatId);
      return res.status(404).json({
        error: 'Chat not found',
        message: 'The specified chat does not exist',
        code: 'CHAT_NOT_FOUND'
      });
    }

    // Create message
    const messageId = uuidv4();
    const actualChatId = chatCheck.rows[0].id;
    
    // Check if user is participant in this chat
    const participantCheck = await query(
      'SELECT id FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
      [actualChatId, req.user.id]
    );

    if (participantCheck.rows.length === 0) {
      console.log('⚠️ User not participant in chat:', actualChatId);
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a participant in this chat',
        code: 'ACCESS_DENIED'
      });
    }
    const messageResult = await query(`
      INSERT INTO messages (id, chat_id, sender_id, content, message_type)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, content, message_type, sender_id, created_at, updated_at
    `, [messageId, actualChatId, req.user.id, content, type]);

    // Get sender info
    const senderResult = await query(
      'SELECT username, first_name, last_name, profile_picture FROM users WHERE id = $1',
      [req.user.id]
    );

    // Update chat's last message information
    console.log('🔄 Updating chat last message info:', {
      chatId: actualChatId,
      content: content,
      senderId: req.user.id,
      messageTime: messageResult.rows[0].created_at
    });
    
    const updateResult = await query(`
      UPDATE chats 
      SET last_message_at = $1, 
          last_message_content = $2,
          last_message_sender_id = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `, [messageResult.rows[0].created_at, content, req.user.id, actualChatId]);
    
    console.log('✅ Chat update result:', updateResult.rowCount, 'rows affected');

    const message = {
      id: messageResult.rows[0].id,
      content: messageResult.rows[0].content,
      type: messageResult.rows[0].message_type,
      senderId: messageResult.rows[0].sender_id,
      sender: {
        id: req.user.id,
        username: senderResult.rows[0].username,
        firstName: senderResult.rows[0].first_name,
        lastName: senderResult.rows[0].last_name,
        profilePicture: senderResult.rows[0].profile_picture
      },
      createdAt: messageResult.rows[0].created_at,
      updatedAt: messageResult.rows[0].updated_at
    };

    console.log('✅ Message sent successfully:', messageId);

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: message
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      error: 'Failed to send message',
      message: 'An error occurred while sending message',
      code: 'MESSAGE_SEND_ERROR'
    });
  }
});

// Update message
router.put('/:messageId', [
  body('content')
    .notEmpty()
    .withMessage('Message content is required')
    .isLength({ max: 4000 })
    .withMessage('Message content must be 4000 characters or less')
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

    const { messageId } = req.params;
    const { content } = req.body;

    // Check if message exists and user is the sender
    const messageCheck = await query(
      'SELECT id, sender_id FROM messages WHERE id = $1',
      [messageId]
    );

    if (messageCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Message not found',
        message: 'Message does not exist',
        code: 'MESSAGE_NOT_FOUND'
      });
    }

    if (messageCheck.rows[0].sender_id !== req.user.id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only edit your own messages',
        code: 'ACCESS_DENIED'
      });
    }

    // Update message
    const updateResult = await query(`
      UPDATE messages 
      SET content = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, content, message_type, sender_id, created_at, updated_at
    `, [content, messageId]);

    res.json({
      success: true,
      message: 'Message updated successfully',
      data: updateResult.rows[0]
    });

  } catch (error) {
    console.error('Update message error:', error);
    res.status(500).json({
      error: 'Failed to update message',
      message: 'An error occurred while updating message',
      code: 'MESSAGE_UPDATE_ERROR'
    });
  }
});

// Delete message
router.delete('/:messageId', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;

    // Check if message exists and user is the sender
    const messageCheck = await query(
      'SELECT id, sender_id FROM messages WHERE id = $1',
      [messageId]
    );

    if (messageCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Message not found',
        message: 'Message does not exist',
        code: 'MESSAGE_NOT_FOUND'
      });
    }

    if (messageCheck.rows[0].sender_id !== req.user.id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only delete your own messages',
        code: 'ACCESS_DENIED'
      });
    }

    // Delete message
    await query('DELETE FROM messages WHERE id = $1', [messageId]);

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });

  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      error: 'Failed to delete message',
      message: 'An error occurred while deleting message',
      code: 'MESSAGE_DELETE_ERROR'
    });
  }
});

module.exports = router;
