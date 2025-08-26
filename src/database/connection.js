const { Pool } = require('pg');
require('dotenv').config();

let pool;
let dbType = process.env.DB_TYPE || 'sqlite';

// Debug environment variables
console.log('🔍 Environment variables:');
console.log('DB_TYPE:', process.env.DB_TYPE);
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('NODE_ENV:', process.env.NODE_ENV);

// PostgreSQL connection for production
if (dbType === 'postgresql') {
  console.log('🔄 Attempting PostgreSQL connection...');
  console.log('Connection string:', process.env.DATABASE_URL);
  
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  console.log('✅ PostgreSQL database connected successfully');

  // Database query helper for PostgreSQL
  async function query(sql, params = []) {
    try {
      const client = await pool.connect();
      try {
        const result = await client.query(sql, params);
        return {
          rows: result.rows,
          rowCount: result.rowCount,
          insertId: result.rows[0]?.id || null
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }

  // Initialize database tables for PostgreSQL
  async function initializeDatabase() {
    try {
      console.log('🔄 Initializing PostgreSQL database tables...');
      
      // Import and run the migration
      const { createTables } = require('./migrate');
      await createTables();
      
      console.log('✅ PostgreSQL database tables initialized successfully!');
      return { pool, query };
    } catch (error) {
      console.error('❌ PostgreSQL database initialization failed:', error);
      throw error;
    }
  }

  module.exports = {
    initializeDatabase,
    query,
    pool
  };

} else {
  // SQLite connection for development (fallback)
  const Database = require('better-sqlite3');
  const path = require('path');

  const dbPath = path.join(__dirname, '../../telegram_clone.db');
  const db = new Database(dbPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  console.log('✅ SQLite database connected successfully');

  // Database query helper for SQLite
  function query(sql, params = []) {
    try {
      const stmt = db.prepare(sql);
      
      // Check if it's a SELECT statement
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        const rows = stmt.all(...params);
        return {
          rows: rows,
          rowCount: rows.length,
          insertId: null
        };
      } else {
        // For INSERT, UPDATE, DELETE statements
        const result = stmt.run(...params);
        return {
          rows: [],
          rowCount: result.changes,
          insertId: result.lastInsertRowid
        };
      }
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }

  // Initialize database tables for SQLite
  function initializeDatabase() {
    try {
      console.log('🔄 Initializing SQLite database tables...');

      // Users table
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          phone_number TEXT UNIQUE,
          password_hash TEXT NOT NULL,
          first_name TEXT,
          last_name TEXT,
          bio TEXT,
          profile_picture TEXT,
          is_online INTEGER DEFAULT 0,
          last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // User locations table
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_locations (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          accuracy REAL,
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id)
        )
      `);

      // User follows table
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_follows (
          id TEXT PRIMARY KEY,
          follower_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          following_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(follower_id, following_id)
        )
      `);

      // Signal keys table
      db.exec(`
        CREATE TABLE IF NOT EXISTS signal_keys (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          identity_key_public TEXT NOT NULL,
          identity_key_private TEXT NOT NULL,
          registration_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Chats table
      db.exec(`
        CREATE TABLE IF NOT EXISTS chats (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL DEFAULT 'private',
          title TEXT,
          description TEXT,
          is_group INTEGER DEFAULT 0,
          group_type TEXT,
          is_channel INTEGER DEFAULT 0,
          is_broadcast INTEGER DEFAULT 0,
          is_megagroup INTEGER DEFAULT 0,
          is_gigagroup INTEGER DEFAULT 0,
          is_forum INTEGER DEFAULT 0,
          member_count INTEGER DEFAULT 0,
          max_members INTEGER,
          is_public INTEGER DEFAULT 0,
          username TEXT UNIQUE,
          invite_link TEXT,
          creator_id TEXT REFERENCES users(id),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Chat participants table
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_participants (
          id TEXT PRIMARY KEY,
          chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          role TEXT DEFAULT 'member',
          joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(chat_id, user_id)
        )
      `);

      // Messages table
      db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,
          sender_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          content TEXT,
          encrypted_content TEXT,
          message_type TEXT DEFAULT 'text',
          reply_to TEXT REFERENCES messages(id),
          forward_from TEXT REFERENCES messages(id),
          is_encrypted INTEGER DEFAULT 1,
          is_edited INTEGER DEFAULT 0,
          is_deleted INTEGER DEFAULT 0,
          delivery_status TEXT DEFAULT 'sent',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Files table
      db.exec(`
        CREATE TABLE IF NOT EXISTS files (
          id TEXT PRIMARY KEY,
          message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          size INTEGER NOT NULL,
          mime_type TEXT NOT NULL,
          url TEXT NOT NULL,
          thumbnail_url TEXT,
          uploaded_by TEXT REFERENCES users(id),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // User sessions table
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          refresh_token TEXT NOT NULL,
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for better performance
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_chat_participants_chat_id ON chat_participants(chat_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_chat_participants_user_id ON chat_participants(user_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_signal_keys_user_id ON signal_keys(user_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_user_locations_user_id ON user_locations(user_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_user_locations_coords ON user_locations(latitude, longitude)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows(following_id)');

      console.log('✅ SQLite database tables initialized successfully!');
      return { db, query };
    } catch (error) {
      console.error('❌ SQLite database initialization failed:', error);
      throw error;
    }
  }

  // Mock Redis functions for development
  async function redisGet(key) {
    return null; // In-memory storage not implemented for simplicity
  }

  async function redisSet(key, value, expireSeconds = 3600) {
    // In-memory storage not implemented for simplicity
  }

  async function redisDel(key) {
    // In-memory storage not implemented for simplicity
  }

  module.exports = {
    initializeDatabase,
    query,
    redisGet,
    redisSet,
    redisDel,
    db
  };
}
