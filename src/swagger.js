const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Telegram Clone Backend API',
      version: '1.0.0',
      description: 'Complete API documentation for the Telegram Clone Backend',
      contact: {
        name: 'API Support',
        url: 'https://web-production-e4d3d.up.railway.app'
      }
    },
    servers: [
      {
        url: 'https://web-production-e4d3d.up.railway.app/api/v1',
        description: 'Production server'
      },
      {
        url: 'http://localhost:3000/api/v1',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            username: { type: 'string' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            phoneNumber: { type: 'string' },
            profilePicture: { type: 'string', format: 'uri' },
            bio: { type: 'string' },
            isOnline: { type: 'boolean' },
            lastSeen: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Message: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            chatId: { type: 'string', format: 'uuid' },
            content: { type: 'string' },
            type: { type: 'string', enum: ['text', 'image', 'video', 'audio', 'file', 'location'] },
            senderId: { type: 'string', format: 'uuid' },
            sender: { $ref: '#/components/schemas/User' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Chat: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            type: { type: 'string', enum: ['private', 'group'] },
            title: { type: 'string' },
            description: { type: 'string' },
            isGroup: { type: 'boolean' },
            memberCount: { type: 'integer' },
            participants: { type: 'array', items: { $ref: '#/components/schemas/User' } },
            lastMessage: { $ref: '#/components/schemas/Message' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Group: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            isGroup: { type: 'boolean' },
            memberCount: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            code: { type: 'string' }
          }
        }
      }
    }
  },
  apis: ['./src/routes/*.js']
};

const specs = swaggerJsdoc(options);

module.exports = specs;
