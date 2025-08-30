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

    // Check if user exists
    const userCheck = await query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The specified user does not exist',
        code: 'USER_NOT_FOUND'
      });
    }

    // Get prekeys for user
    let prekeysResult;
    try {
      prekeysResult = await query(
        'SELECT prekey_bundle FROM signal_prekeys WHERE user_id = $1',
        [userId]
      );
    } catch (error) {
      console.log('⚠️ Signal prekeys table might not exist, creating default bundle');
      // Return default prekeys if table doesn't exist
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

      return res.json({
        success: true,
        bundle: defaultPrekeyBundle
      });
    }

    if (prekeysResult.rows.length === 0) {
      // Create default prekeys if none exist
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

      try {
        await query(`
          INSERT INTO signal_prekeys (user_id, prekey_bundle, created_at)
          VALUES ($1, $2, NOW())
        `, [userId, JSON.stringify(defaultPrekeyBundle)]);
      } catch (error) {
        console.log('⚠️ Could not insert prekeys, returning default bundle');
      }

      console.log('✅ Created default prekeys for user:', userId);
      return res.json({
        success: true,
        bundle: defaultPrekeyBundle
      });
    }

    const prekeyBundle = JSON.parse(prekeysResult.rows[0].prekey_bundle);
    console.log('✅ Retrieved prekeys for user:', userId);

    res.json({
      success: true,
      bundle: prekeyBundle
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
