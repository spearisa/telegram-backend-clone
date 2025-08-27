#!/usr/bin/env node

console.log('🔄 Redirecting to correct server setup...');

// Import and run our correct setup
require('./setup-database.js').setupDatabase()
  .then(() => {
    console.log('✅ Database setup completed, starting main server...');
    require('./src/index.js');
  })
  .catch((error) => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  });
// Force Railway rebuild - Tue Aug 26 22:17:13 -05 2025
