const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../database/connection');

const router = express.Router();

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Update user location
router.post('/location', [
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  body('accuracy')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Accuracy must be a positive number')
], authenticateToken, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Invalid location data',
        details: errors.array(),
        code: 'VALIDATION_ERROR'
      });
    }

    const { latitude, longitude, accuracy } = req.body;
    const userId = req.user.id;

    // Check if user already has a location
    const existingLocation = await query(
      'SELECT id FROM user_locations WHERE user_id = $1',
      [userId]
    );

    if (existingLocation.rows.length > 0) {
      // Update existing location
      await query(
        `UPDATE user_locations 
         SET latitude = $1, longitude = $2, accuracy = $3, last_updated = CURRENT_TIMESTAMP 
         WHERE user_id = $4`,
        [latitude, longitude, accuracy, userId]
      );
    } else {
      // Create new location
      const locationId = uuidv4();
      await query(
        `INSERT INTO user_locations (id, user_id, latitude, longitude, accuracy, last_updated) 
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [locationId, userId, latitude, longitude, accuracy]
      );
    }

    console.log('✅ Location updated successfully for user:', userId);
    res.json({
      message: 'Location updated successfully',
      location: { latitude, longitude, accuracy }
    });

  } catch (error) {
    console.error('Location update error:', error);
    res.status(500).json({
      error: 'Location update failed',
      message: 'Failed to update location',
      code: 'LOCATION_UPDATE_ERROR'
    });
  }
});

// Get nearby users within specified radius (default 10km)
router.get('/nearby', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude, radius = 10 } = req.query;
    const userId = req.user.id;

    console.log('🔄 Getting nearby users:', { latitude, longitude, radius, userId });

    // Validate radius parameter
    const radiusNum = parseFloat(radius);
    if (isNaN(radiusNum) || radiusNum <= 0 || radiusNum > 100) {
      return res.status(400).json({
        error: 'Invalid radius parameter',
        message: 'Radius must be a positive number between 0.1 and 100 km',
        code: 'INVALID_RADIUS'
      });
    }

    // Get user's current location
    const userLocation = await query(
      'SELECT latitude, longitude FROM user_locations WHERE user_id = $1',
      [userId]
    );

    if (userLocation.rows.length === 0) {
      return res.status(400).json({
        error: 'No location found',
        message: 'Please update your location first',
        code: 'NO_LOCATION'
      });
    }

    const userLat = userLocation.rows[0].latitude;
    const userLon = userLocation.rows[0].longitude;

    // Get all users with locations
    const nearbyUsers = await query(`
      SELECT 
        u.id, u.username, u.first_name, u.last_name, u.profile_picture,
        ul.latitude, ul.longitude,
        ul.last_updated
      FROM users u
      INNER JOIN user_locations ul ON u.id = ul.user_id
      WHERE u.id != $1
    `, [userId]);

    // Calculate distances and filter by radius
    const usersInRadius = nearbyUsers.rows
      .map(user => {
        const distance = calculateDistance(userLat, userLon, user.latitude, user.longitude);
        return {
          ...user,
          distance: Math.round(distance * 100) / 100 // Round to 2 decimal places
        };
      })
      .filter(user => user.distance <= radiusNum)
      .sort((a, b) => a.distance - b.distance);

    console.log('✅ Found nearby users:', usersInRadius.length);

    res.json({
      success: true,
      users: usersInRadius,
      userLocation: { latitude: userLat, longitude: userLon },
      radius: radiusNum
    });

  } catch (error) {
    console.error('Get nearby users error:', error);
    res.status(500).json({
      error: 'Failed to get nearby users',
      message: 'An error occurred while fetching nearby users',
      code: 'NEARBY_USERS_ERROR'
    });
  }
});

// Follow a user
router.post('/follow/:userId', authenticateToken, async (req, res) => {
  try {
    const followerId = req.user.id;
    const followingId = req.params.userId;

    // Check if user exists
    const userExists = await query(
      'SELECT id FROM users WHERE id = $1',
      [followingId]
    );

    if (userExists.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The user you are trying to follow does not exist',
        code: 'USER_NOT_FOUND'
      });
    }

    // Handle self-follow (add to contacts)
    if (followerId === followingId) {
      // Add self to contacts instead of blocking
      await query(`
        INSERT INTO user_contacts (user_id, contact_id, created_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id, contact_id) DO NOTHING
      `, [followerId, followingId]);
      
      return res.status(201).json({
        message: 'Added to contacts',
        success: true,
        isSelfFollow: true
      });
    }

    // Check if already following
    const alreadyFollowing = await query(
      'SELECT id FROM user_follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, followingId]
    );

    if (alreadyFollowing.rows.length > 0) {
      return res.status(409).json({
        error: 'Already following',
        message: 'You are already following this user',
        code: 'ALREADY_FOLLOWING'
      });
    }

    // Create follow relationship
    const followId = uuidv4();
    await query(
      'INSERT INTO user_follows (id, follower_id, following_id) VALUES ($1, $2, $3)',
      [followId, followerId, followingId]
    );

    // Also add to contacts
    await query(`
      INSERT INTO user_contacts (user_id, contact_id, created_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id, contact_id) DO NOTHING
    `, [followerId, followingId]);

    res.status(201).json({
      message: 'Successfully followed user',
      success: true,
      followId,
      followerId,
      followingId
    });

  } catch (error) {
    console.error('Follow user error:', error);
    res.status(500).json({
      error: 'Follow failed',
      message: 'Failed to follow user',
      code: 'FOLLOW_ERROR'
    });
  }
});

// Unfollow a user
router.delete('/follow/:userId', authenticateToken, async (req, res) => {
  try {
    const followerId = req.user.id;
    const followingId = req.params.userId;

    // Check if following
    const followExists = await query(
      'SELECT id FROM user_follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, followingId]
    );

    if (followExists.rows.length === 0) {
      return res.status(404).json({
        error: 'Not following',
        message: 'You are not following this user',
        code: 'NOT_FOLLOWING'
      });
    }

    // Remove follow relationship
    await query(
      'DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, followingId]
    );

    res.json({
      message: 'Successfully unfollowed user',
      followerId,
      followingId
    });

  } catch (error) {
    console.error('Unfollow user error:', error);
    res.status(500).json({
      error: 'Unfollow failed',
      message: 'Failed to unfollow user',
      code: 'UNFOLLOW_ERROR'
    });
  }
});

// Get user's followers
router.get('/followers', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;

    const followers = await query(
      `SELECT 
        u.id, u.username, u.first_name, u.last_name, u.bio, u.profile_picture,
        u.is_online, u.last_seen, u.created_at,
        uf.created_at as followed_at
       FROM users u
       INNER JOIN user_follows uf ON u.id = uf.follower_id
       WHERE uf.following_id = $1
       ORDER BY uf.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, parseInt(limit), parseInt(offset)]
    );

    res.json({
      followers: followers.rows,
      total: followers.rows.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({
      error: 'Failed to get followers',
      message: 'An error occurred while fetching followers',
      code: 'FOLLOWERS_ERROR'
    });
  }
});

// Get users that the current user is following
router.get('/following', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;

    const following = await query(
      `SELECT 
        u.id, u.username, u.first_name, u.last_name, u.bio, u.profile_picture,
        u.is_online, u.last_seen, u.created_at,
        uf.created_at as followed_at
       FROM users u
       INNER JOIN user_follows uf ON u.id = uf.following_id
       WHERE uf.follower_id = $1
       ORDER BY uf.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, parseInt(limit), parseInt(offset)]
    );

    res.json({
      following: following.rows,
      total: following.rows.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({
      error: 'Failed to get following',
      message: 'An error occurred while fetching following list',
      code: 'FOLLOWING_ERROR'
    });
  }
});

// Alternative endpoint for nearby users (for better API consistency)
router.get('/users', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude, radius = 10 } = req.query;
    const userId = req.user.id;

    console.log('🔄 Getting nearby users via /users endpoint:', { latitude, longitude, radius, userId });

    // Validate radius parameter
    const radiusNum = parseFloat(radius);
    if (isNaN(radiusNum) || radiusNum <= 0 || radiusNum > 100) {
      return res.status(400).json({
        error: 'Invalid radius parameter',
        message: 'Radius must be a positive number between 0.1 and 100 km',
        code: 'INVALID_RADIUS'
      });
    }

    // Check if user has a location
    const userLocation = await query(
      'SELECT latitude, longitude FROM user_locations WHERE user_id = $1',
      [userId]
    );

    if (userLocation.rows.length === 0) {
      return res.status(400).json({
        error: 'No location found',
        message: 'Please update your location first',
        code: 'NO_LOCATION'
      });
    }

    // Get nearby users
    const nearbyUsers = await query(
      `SELECT 
        u.id, u.username, u.first_name, u.last_name, u.bio, u.profile_picture,
        u.is_online, u.last_seen, u.created_at,
        ul.latitude, ul.longitude, ul.accuracy,
        ul.last_updated as location_updated
       FROM users u
       INNER JOIN user_locations ul ON u.id = ul.user_id
       WHERE u.id != $1
       ORDER BY ul.last_updated DESC`,
      [userId]
    );

    // Filter users within radius
    const userLat = parseFloat(latitude || userLocation.rows[0].latitude);
    const userLon = parseFloat(longitude || userLocation.rows[0].longitude);
    
    const usersWithinRadius = nearbyUsers.rows.filter(user => {
      const distance = calculateDistance(
        userLat, userLon,
        parseFloat(user.latitude), parseFloat(user.longitude)
      );
      return distance <= radiusNum;
    });

    console.log('✅ Found nearby users:', usersWithinRadius.length);
    res.json({
      users: usersWithinRadius,
      total: usersWithinRadius.length,
      radius: radiusNum,
      userLocation: { latitude: userLat, longitude: userLon }
    });

  } catch (error) {
    console.error('Get nearby users error:', error);
    res.status(500).json({
      error: 'Failed to get nearby users',
      message: 'An error occurred while fetching nearby users',
      code: 'NEARBY_USERS_ERROR'
    });
  }
});

module.exports = router;
