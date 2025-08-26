const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Upload prekeys
router.post('/prekeys', authenticateToken, (req, res) => {
  // TODO: Implement prekey upload
  res.json({ message: 'Prekey upload endpoint - to be implemented' });
});

// Get user's prekeys
router.get('/prekeys/:userId', authenticateToken, (req, res) => {
  // TODO: Implement get prekeys
  res.json({ message: 'Get prekeys endpoint - to be implemented' });
});

module.exports = router;
