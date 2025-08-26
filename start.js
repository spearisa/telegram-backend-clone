#!/usr/bin/env node

// Simple start script for Railway deployment
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Telegram Clone Backend...');
console.log('📁 Current directory:', process.cwd());
console.log('🔧 Node version:', process.version);
console.log('🌍 Environment:', process.env.NODE_ENV || 'development');

// Check if we're in the right directory
const packageJsonPath = path.join(process.cwd(), 'package.json');
const fs = require('fs');

if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ package.json not found. Make sure you\'re in the server directory.');
  process.exit(1);
}

// Start the server
const server = spawn('node', ['src/index.js'], {
  stdio: 'inherit',
  env: process.env
});

server.on('error', (error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

server.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code);
});

// Handle process signals
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  server.kill('SIGINT');
});
