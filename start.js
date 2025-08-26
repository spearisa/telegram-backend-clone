const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Telegram Clone Backend Server...');

// Set environment variables
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.DB_TYPE = process.env.DB_TYPE || 'postgresql';

// Start the server
const server = spawn('node', ['src/index.js'], {
  stdio: 'inherit',
  env: process.env
});

server.on('error', (error) => {
  console.error('❌ Server error:', error);
  process.exit(1);
});

server.on('close', (code) => {
  console.log(`🔄 Server process exited with code ${code}`);
  process.exit(code);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  server.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  server.kill('SIGINT');
});
