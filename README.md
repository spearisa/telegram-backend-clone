# Telegram Clone Backend - Full Version

This is the complete backend for the Telegram clone application with all features:

## Features
- ✅ User authentication and registration
- ✅ Real-time messaging with Socket.IO
- ✅ File uploads and media sharing
- ✅ Database support (PostgreSQL/SQLite)
- ✅ Message encryption
- ✅ User profiles and contacts
- ✅ Group chats
- ✅ Message history

## Railway Deployment

This backend is configured for Railway deployment with:
- PostgreSQL database support
- Environment variable configuration
- Health check endpoints
- Automatic restart on failure

## Environment Variables Required

```env
NODE_ENV=production
DB_TYPE=postgresql
DATABASE_URL=your_postgresql_url
JWT_SECRET=your_jwt_secret
CORS_ORIGIN=your_frontend_url
```

## API Endpoints

- `GET /health` - Health check
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `GET /api/v1/users` - Get users
- `POST /api/v1/messages` - Send message
- `GET /api/v1/messages` - Get messages

## Database Setup

The backend will automatically:
1. Connect to PostgreSQL database
2. Run migrations
3. Create necessary tables
4. Set up indexes

## Socket.IO Events

- `connection` - User connects
- `disconnect` - User disconnects
- `send_message` - Send a message
- `join_room` - Join a chat room
- `leave_room` - Leave a chat room
