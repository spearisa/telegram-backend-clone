const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./swagger');
require('dotenv').config();

const { initializeDatabase } = require('./database/connection');
const { initializeWebSocket } = require('./websocket/socket');
const authRoutes = require('./routes/auth');
const simpleAuthRoutes = require('./routes/simple-auth');
const basicAuthRoutes = require('./routes/basic-auth');
const userRoutes = require('./routes/users');
const chatRoutes = require('./routes/chats');
const messageRoutes = require('./routes/messages');
const groupRoutes = require('./routes/groups');
const fileRoutes = require('./routes/files');
const signalRoutes = require('./routes/signal');
const nearbyRoutes = require('./routes/nearby');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ["http://localhost:3000", "http://localhost:19006"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(compression());

// Trust proxy for Railway
app.set('trust proxy', 1);

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || [
    "http://localhost:3000", 
    "http://localhost:19006",
    "http://localhost:8080",
    "http://192.168.20.137:3000",
    "http://192.168.20.137:19006",
    "http://192.168.20.137:8080",
    "exp://192.168.20.137:8081",
    "exp://localhost:8081"
  ],
  credentials: true
}));

// Rate limiting - More generous for mobile app
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 1 * 60 * 1000, // 1 minute window
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // Allow 1000 requests per minute per IP
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: Math.ceil(60 / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks and OPTIONS requests
    return req.path === '/health' || req.path === '/ws/status' || req.method === 'OPTIONS';
  }
});
app.use('/api/', limiter);

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static('uploads'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// WebSocket status endpoint
app.get('/ws/status', (req, res) => {
  res.status(200).json({
    status: 'WebSocket server running',
    timestamp: new Date().toISOString(),
    connections: io.engine.clientsCount || 0
  });
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/simple-auth', simpleAuthRoutes);
app.use('/api/v1/basic-auth', basicAuthRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/chats', chatRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/groups', groupRoutes);
app.use('/api/v1/files', fileRoutes);
app.use('/api/v1/signal', signalRoutes);
app.use('/api/v1/nearby', nearbyRoutes);

// WebSocket initialization
initializeWebSocket(io);

// Swagger UI - must be before 404 handler
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Initialize database and start server
async function startServer() {
  try {
    // Try to initialize database, but don't fail if it doesn't work
    try {
      await initializeDatabase();
      console.log('✅ Database connected successfully');
    } catch (dbError) {
      console.error('⚠️ Database connection failed, but continuing with server startup:', dbError.message);
    }
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📱 API available at http://0.0.0.0:${PORT}/api/v1`);
      console.log(`🔌 WebSocket available at ws://0.0.0.0:${PORT}`);
      console.log(`🏥 Health check at http://0.0.0.0:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

startServer();
// Force deployment - Wed Aug 27 16:58:31 -05 2025
