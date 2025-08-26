# Telegram Clone Backend Server

A production-ready backend server for the Telegram clone with real-time messaging, Signal Protocol encryption, and advanced group features.

## 🚀 Features

- **Real-time Messaging**: WebSocket-based instant messaging
- **Signal Protocol Encryption**: End-to-end encrypted messaging
- **User Authentication**: JWT-based authentication with refresh tokens
- **Advanced Groups**: Channels, Supergroups, Gigagroups, Basic Groups, Forums
- **File Upload**: Secure file sharing and storage
- **Database**: PostgreSQL with Redis for caching
- **Security**: Rate limiting, CORS, Helmet, input validation

## 📋 Prerequisites

- Node.js 16+ 
- PostgreSQL 12+
- Redis 6+ (optional, for caching)

## 🛠️ Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Set up environment variables:**
```bash
cp env.example .env
# Edit .env with your configuration
```

3. **Set up PostgreSQL database:**
```bash
# Create database
createdb telegram_clone

# Run migrations
npm run migrate
```

4. **Start the server:**
```bash
# Development
npm run dev

# Production
npm start
```

## 🔧 Environment Variables

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/telegram_clone
REDIS_URL=redis://localhost:6379

# File Upload Configuration
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS Configuration
CORS_ORIGIN=http://localhost:3000,http://localhost:19006
```

## 📡 API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/refresh` - Refresh JWT token
- `POST /api/v1/auth/logout` - Logout user

### Users
- `GET /api/v1/users/profile` - Get user profile
- `PUT /api/v1/users/profile` - Update user profile
- `GET /api/v1/users/{userId}` - Get user by ID
- `GET /api/v1/users/search` - Search users

### Messages
- `GET /api/v1/messages/{chatId}` - Get chat messages
- `POST /api/v1/messages/{chatId}` - Send message

### Chats
- `GET /api/v1/chats` - Get user's chats
- `GET /api/v1/chats/{chatId}` - Get chat details

### Groups
- `GET /api/v1/groups` - Get user's groups
- `POST /api/v1/groups` - Create new group
- `PUT /api/v1/groups/{groupId}` - Update group
- `GET /api/v1/groups/{groupId}/members` - Get group members
- `POST /api/v1/groups/{groupId}/members` - Add member
- `DELETE /api/v1/groups/{groupId}/members/{userId}` - Remove member

### Signal Protocol
- `POST /api/v1/signal/prekeys` - Upload prekeys
- `GET /api/v1/signal/prekeys/{userId}` - Get user's prekeys

### Files
- `POST /api/v1/files/upload` - Upload file
- `GET /api/v1/files/{fileId}` - Download file

## 🔌 WebSocket Events

### Client to Server
- `typing_start` - Start typing indicator
- `typing_stop` - Stop typing indicator
- `message_read` - Mark message as read
- `join_chat` - Join chat room
- `leave_chat` - Leave chat room

### Server to Client
- `new_message` - New message received
- `message_delivered` - Message delivered
- `message_read` - Message read by recipient
- `typing_started` - User started typing
- `typing_stopped` - User stopped typing
- `user_status_changed` - User online/offline status
- `notification` - General notification

## 🗄️ Database Schema

The server uses PostgreSQL with the following main tables:
- `users` - User accounts and profiles
- `signal_keys` - Signal Protocol encryption keys
- `chats` - Chat and group information
- `chat_participants` - Chat membership
- `messages` - Message storage
- `files` - File metadata
- `group_permissions` - Group permissions
- `forum_topics` - Forum topics
- `user_sessions` - Refresh tokens

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt with 12 salt rounds
- **Rate Limiting**: Prevents abuse
- **Input Validation**: Express-validator for all inputs
- **CORS Protection**: Configurable cross-origin requests
- **Helmet**: Security headers
- **Signal Protocol**: End-to-end encryption

## 🚀 Deployment

### Heroku
```bash
# Create Heroku app
heroku create your-telegram-clone

# Add PostgreSQL addon
heroku addons:create heroku-postgresql:hobby-dev

# Add Redis addon (optional)
heroku addons:create heroku-redis:hobby-dev

# Set environment variables
heroku config:set JWT_SECRET=your-secret-key
heroku config:set NODE_ENV=production

# Deploy
git push heroku main
```

### Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

### Docker
```bash
# Build image
docker build -t telegram-clone-backend .

# Run container
docker run -p 3000:3000 telegram-clone-backend
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## 📊 Monitoring

- **Health Check**: `GET /health`
- **Logging**: Morgan for HTTP requests
- **Error Handling**: Centralized error handling
- **Database Monitoring**: Query logging and performance tracking

## 🔧 Development

```bash
# Start development server with hot reload
npm run dev

# Run database migrations
npm run migrate

# Check linting
npm run lint

# Format code
npm run format
```

## 📝 License

MIT License - see LICENSE file for details
