const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user's chats
router.get('/', authenticateToken, (req, res) => {
  // TODO: Implement get user chats
  res.json({ message: 'Get user chats endpoint - to be implemented' });
});

// Get chat details
router.get('/:chatId', authenticateToken, (req, res) => {
  // TODO: Implement get chat details
  res.json({ message: 'Get chat details endpoint - to be implemented' });
});

module.exports = router;
