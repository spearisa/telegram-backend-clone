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
      'SELECT id FROM user_locations WHERE user_id = ?',
      [userId]
    );

    if (existingLocation.rows.length > 0) {
      // Update existing location
      await query(
        `UPDATE user_locations 
         SET latitude = ?, longitude = ?, accuracy = ?, last_updated = CURRENT_TIMESTAMP 
         WHERE user_id = ?`,
        [latitude, longitude, accuracy, userId]
      );
    } else {
      // Create new location
      const locationId = uuidv4();
      await query(
        `INSERT INTO user_locations (id, user_id, latitude, longitude, accuracy) 
         VALUES (?, ?, ?, ?, ?)`,
        [locationId, userId, latitude, longitude, accuracy]
      );
    }

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
router.get('/nearby', [
  body('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  body('radius')
    .optional()
    .isFloat({ min: 0.1, max: 100 })
    .withMessage('Radius must be between 0.1 and 100 kilometers')
], authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude, radius = 10 } = req.query;
    const userId = req.user.id;

    // If no coordinates provided, use current user's location
    let userLat, userLon;
    if (latitude && longitude) {
      userLat = parseFloat(latitude);
      userLon = parseFloat(longitude);
    } else {
      // Get current user's location
      const userLocation = await query(
        'SELECT latitude, longitude FROM user_locations WHERE user_id = ?',
        [userId]
      );

      if (userLocation.rows.length === 0) {
        return res.status(400).json({
          error: 'Location required',
          message: 'Please provide location coordinates or update your location first',
          code: 'LOCATION_REQUIRED'
        });
      }

      userLat = userLocation.rows[0].latitude;
      userLon = userLocation.rows[0].longitude;
    }

    // Get all users with locations (excluding current user)
    const nearbyUsers = await query(
      `SELECT 
        u.id, u.username, u.first_name, u.last_name, u.bio, u.profile_picture,
        u.is_online, u.last_seen, u.created_at,
        ul.latitude, ul.longitude, ul.accuracy, ul.last_updated
       FROM users u
       INNER JOIN user_locations ul ON u.id = ul.user_id
       WHERE u.id != ?`,
      [userId]
    );

    // Calculate distances and filter by radius
    const usersInRadius = nearbyUsers.rows
      .map(user => {
        const distance = calculateDistance(
          userLat, userLon, 
          user.latitude, user.longitude
        );
        return {
          ...user,
          distance: Math.round(distance * 100) / 100 // Round to 2 decimal places
        };
      })
      .filter(user => user.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    // Check follow status for each user
    const usersWithFollowStatus = await Promise.all(
      usersInRadius.map(async (user) => {
        const followStatus = await query(
          'SELECT id FROM user_follows WHERE follower_id = ? AND following_id = ?',
          [userId, user.id]
        );

        return {
          ...user,
          isFollowing: followStatus.rows.length > 0
        };
      })
    );

    res.json({
      users: usersInRadius,
      total: usersInRadius.length,
      radius: parseFloat(radius),
      userLocation: { latitude: userLat, longitude: userLon }
    });

  } catch (error) {
    console.error('Nearby users error:', error);
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

    // Check if trying to follow self
    if (followerId === followingId) {
      return res.status(400).json({
        error: 'Cannot follow yourself',
        message: 'You cannot follow your own account',
        code: 'SELF_FOLLOW_ERROR'
      });
    }

    // Check if user exists
    const userExists = await query(
      'SELECT id FROM users WHERE id = ?',
      [followingId]
    );

    if (userExists.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The user you are trying to follow does not exist',
        code: 'USER_NOT_FOUND'
      });
    }

    // Check if already following
    const alreadyFollowing = await query(
      'SELECT id FROM user_follows WHERE follower_id = ? AND following_id = ?',
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
      'INSERT INTO user_follows (id, follower_id, following_id) VALUES (?, ?, ?)',
      [followId, followerId, followingId]
    );

    res.status(201).json({
      message: 'Successfully followed user',
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
      'SELECT id FROM user_follows WHERE follower_id = ? AND following_id = ?',
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
      'DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?',
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
       WHERE uf.following_id = ?
       ORDER BY uf.created_at DESC
       LIMIT ? OFFSET ?`,
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
       WHERE uf.follower_id = ?
       ORDER BY uf.created_at DESC
       LIMIT ? OFFSET ?`,
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

module.exports = router;
