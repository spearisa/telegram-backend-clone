const jwt = require('jsonwebtoken');
const { query } = require('../database/connection');

let io;

// Store connected users
const connectedUsers = new Map();

const initializeWebSocket = (socketIo) => {
  io = socketIo;

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from database
      const result = await query(
        'SELECT id, username, first_name, last_name, profile_picture FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.userId = decoded.userId;
      socket.user = result.rows[0];
      next();
    } catch (error) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.user.username} (${socket.userId})`);

    // Add user to connected users
    connectedUsers.set(socket.userId, {
      socketId: socket.id,
      user: socket.user,
      connectedAt: new Date()
    });

    // Update user status to online
    updateUserStatus(socket.userId, true);

    // Join user's personal room
    socket.join(`user:${socket.userId}`);

    // Handle typing events
    socket.on('typing_start', (data) => {
      const { chatId } = data;
      socket.to(`chat:${chatId}`).emit('typing_started', {
        userId: socket.userId,
        chatId,
        username: socket.user.username
      });
    });

    socket.on('typing_stop', (data) => {
      const { chatId } = data;
      socket.to(`chat:${chatId}`).emit('typing_stopped', {
        userId: socket.userId,
        chatId,
        username: socket.user.username
      });
    });

    // Handle message read events
    socket.on('message_read', async (data) => {
      const { messageId, chatId } = data;
      
      try {
        // Update message status in database
        await query(
          'UPDATE messages SET delivery_status = $1 WHERE id = $2 AND chat_id = $3',
          ['read', messageId, chatId]
        );

        // Notify other users in chat
        socket.to(`chat:${chatId}`).emit('message_read', {
          messageId,
          chatId,
          userId: socket.userId,
          username: socket.user.username,
          readAt: new Date()
        });
      } catch (error) {
        console.error('Error marking message as read:', error);
      }
    });

    // Handle joining chat rooms
    socket.on('join_chat', (data) => {
      const { chatId } = data;
      socket.join(`chat:${chatId}`);
      console.log(`👥 User ${socket.user.username} joined chat: ${chatId}`);
    });

    socket.on('leave_chat', (data) => {
      const { chatId } = data;
      socket.leave(`chat:${chatId}`);
      console.log(`👋 User ${socket.user.username} left chat: ${chatId}`);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`🔌 User disconnected: ${socket.user.username} (${socket.userId})`);
      
      // Remove user from connected users
      connectedUsers.delete(socket.userId);
      
      // Update user status to offline
      updateUserStatus(socket.userId, false);
    });
  });
};

// Update user online status
const updateUserStatus = async (userId, isOnline) => {
  try {
    await query(
      'UPDATE users SET is_online = $1, last_seen = CURRENT_TIMESTAMP WHERE id = $2',
      [isOnline, userId]
    );

    // Broadcast status change to all connected users
    io.emit('user_status_changed', {
      userId,
      isOnline,
      lastSeen: new Date()
    });
  } catch (error) {
    console.error('Error updating user status:', error);
  }
};

// Send message to chat participants
const sendMessageToChat = async (chatId, message, senderId) => {
  try {
    // Get chat participants
    const participantsResult = await query(
      'SELECT user_id FROM chat_participants WHERE chat_id = $1',
      [chatId]
    );

    const participants = participantsResult.rows.map(row => row.user_id);

    // Emit to all participants except sender
    participants.forEach(participantId => {
      if (participantId !== senderId) {
        io.to(`user:${participantId}`).emit('new_message', {
          message,
          chatId
        });
      }
    });

    // Also emit to chat room for typing indicators
    io.to(`chat:${chatId}`).emit('message_delivered', {
      messageId: message.id,
      chatId,
      deliveredAt: new Date()
    });

  } catch (error) {
    console.error('Error sending message to chat:', error);
  }
};

// Send notification to specific user
const sendNotificationToUser = (userId, notification) => {
  io.to(`user:${userId}`).emit('notification', notification);
};

// Get connected users
const getConnectedUsers = () => {
  return Array.from(connectedUsers.values());
};

// Check if user is online
const isUserOnline = (userId) => {
  return connectedUsers.has(userId);
};

// Get user's socket ID
const getUserSocketId = (userId) => {
  const user = connectedUsers.get(userId);
  return user ? user.socketId : null;
};

module.exports = {
  initializeWebSocket,
  sendMessageToChat,
  sendNotificationToUser,
  getConnectedUsers,
  isUserOnline,
  getUserSocketId,
  updateUserStatus
};
