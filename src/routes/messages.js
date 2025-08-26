const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get chat messages
router.get('/:chatId', authenticateToken, (req, res) => {
  // TODO: Implement get chat messages
  res.json({ message: 'Get chat messages endpoint - to be implemented' });
});

// Send message
router.post('/:chatId', authenticateToken, (req, res) => {
  // TODO: Implement send message
  res.json({ message: 'Send message endpoint - to be implemented' });
});

module.exports = router;
