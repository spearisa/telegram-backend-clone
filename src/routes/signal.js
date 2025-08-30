const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { query } = require('../database/connection');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Upload prekeys
router.post('/prekeys', authenticateToken, async (req, res) => {
  try {
    const { prekeyBundle } = req.body;
    const userId = req.user.id;

    if (!prekeyBundle) {
      return res.status(400).json({
        error: 'Missing prekey bundle',
        message: 'Prekey bundle is required',
        code: 'MISSING_PREKEY_BUNDLE'
      });
    }

    // Store prekey bundle for user
    await query(`
      INSERT INTO signal_prekeys (user_id, prekey_bundle, created_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        prekey_bundle = $2,
        updated_at = NOW()
    `, [userId, JSON.stringify(prekeyBundle)]);

    console.log('✅ Prekeys uploaded successfully for user:', userId);
    res.status(201).json({
      success: true,
      message: 'Prekeys uploaded successfully'
    });

  } catch (error) {
    console.error('Upload prekeys error:', error);
    res.status(500).json({
      error: 'Failed to upload prekeys',
      message: 'An error occurred while uploading prekeys',
      code: 'PREKEY_UPLOAD_ERROR'
    });
  }
});

// Get user's prekeys
router.get('/prekeys/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user.id;

    console.log('🔄 Getting prekeys for user:', userId, 'requested by:', requestingUserId);

    // For now, return default prekeys without database dependency
    const defaultPrekeyBundle = {
      identityKey: "default_identity_key_" + userId,
      preKeys: [{
        keyId: 1,
        publicKey: "default_public_key_" + userId
      }],
      signedPreKey: {
        keyId: 1,
        publicKey: "default_signed_key_" + userId,
        signature: "default_signature_" + userId
      }
    };

    console.log('✅ Returning default prekeys for user:', userId);

    res.json({
      success: true,
      bundle: defaultPrekeyBundle
    });

  } catch (error) {
    console.error('Get prekeys error:', error);
    res.status(500).json({
      error: 'Failed to get prekeys',
      message: 'An error occurred while retrieving prekeys',
      code: 'PREKEY_RETRIEVAL_ERROR'
    });
  }
});

module.exports = router;
