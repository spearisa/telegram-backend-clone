const { Pool } = require('pg');
require('dotenv').config();

async function setupDatabase() {
  console.log('🔄 Setting up PostgreSQL database...');
  
  // Debug environment variables
  console.log('🔍 Environment variables in setup script:');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('Connection string:', process.env.DATABASE_URL);
  
  // Create connection pool
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    // Test connection
    const client = await pool.connect();
    console.log('✅ Database connection successful');

    // Import and run migration
    const { createTables } = require('./src/database/migrate');
    await createTables();
    
    console.log('✅ Database setup completed successfully!');
    
    // Close connection
    client.release();
    await pool.end();
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    throw error;
  }
}

// Run setup if this file is executed directly
if (require.main === module) {
  setupDatabase()
    .then(() => {
      console.log('🎉 Database setup completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Database setup failed:', error);
      process.exit(1);
    });
}

module.exports = { setupDatabase };
