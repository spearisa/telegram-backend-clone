const { query } = require('./connection');

const createTables = async () => {
  try {
    console.log('🔄 Starting database migration...');

    // Users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(30) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone_number VARCHAR(20) UNIQUE,
        firebase_uid VARCHAR(255) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(50),
        last_name VARCHAR(50),
        bio TEXT,
        profile_picture VARCHAR(500),
        is_online BOOLEAN DEFAULT false,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Signal keys table
    await query(`
      CREATE TABLE IF NOT EXISTS signal_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        identity_key_public TEXT NOT NULL,
        identity_key_private TEXT NOT NULL,
        registration_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Prekeys table
    await query(`
      CREATE TABLE IF NOT EXISTS prekeys (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        prekey_id INTEGER NOT NULL,
        public_key TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Signed prekeys table
    await query(`
      CREATE TABLE IF NOT EXISTS signed_prekeys (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        signed_prekey_id INTEGER NOT NULL,
        public_key TEXT NOT NULL,
        signature TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Chats table
    await query(`
      CREATE TABLE IF NOT EXISTS chats (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(20) NOT NULL DEFAULT 'private',
        title VARCHAR(255),
        description TEXT,
        is_group BOOLEAN DEFAULT false,
        group_type VARCHAR(20),
        is_channel BOOLEAN DEFAULT false,
        is_broadcast BOOLEAN DEFAULT false,
        is_megagroup BOOLEAN DEFAULT false,
        is_gigagroup BOOLEAN DEFAULT false,
        is_forum BOOLEAN DEFAULT false,
        member_count INTEGER DEFAULT 0,
        max_members INTEGER,
        is_public BOOLEAN DEFAULT false,
        username VARCHAR(50) UNIQUE,
        invite_link VARCHAR(500),
        creator_id UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Chat participants table
    await query(`
      CREATE TABLE IF NOT EXISTS chat_participants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(chat_id, user_id)
      )
    `);

    // Messages table
    await query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
        sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
        content TEXT,
        encrypted_content TEXT,
        message_type VARCHAR(20) DEFAULT 'text',
        reply_to UUID REFERENCES messages(id),
        forward_from UUID REFERENCES messages(id),
        is_encrypted BOOLEAN DEFAULT true,
        is_edited BOOLEAN DEFAULT false,
        is_deleted BOOLEAN DEFAULT false,
        delivery_status VARCHAR(20) DEFAULT 'sent',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Files table
    await query(`
      CREATE TABLE IF NOT EXISTS files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        size INTEGER NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        url VARCHAR(500) NOT NULL,
        thumbnail_url VARCHAR(500),
        uploaded_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Group permissions table
    await query(`
      CREATE TABLE IF NOT EXISTS group_permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        can_send_messages BOOLEAN DEFAULT true,
        can_send_media BOOLEAN DEFAULT true,
        can_send_stickers BOOLEAN DEFAULT true,
        can_send_polls BOOLEAN DEFAULT true,
        can_change_info BOOLEAN DEFAULT false,
        can_invite_users BOOLEAN DEFAULT true,
        can_pin_messages BOOLEAN DEFAULT false,
        can_manage_topics BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(chat_id, user_id)
      )
    `);

    // Forum topics table
    await query(`
      CREATE TABLE IF NOT EXISTS forum_topics (
        id SERIAL PRIMARY KEY,
        chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        message_count INTEGER DEFAULT 0,
        is_pinned BOOLEAN DEFAULT false,
        is_closed BOOLEAN DEFAULT false,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // User sessions table
    await query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        refresh_token TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // User contacts table
    await query(`
      CREATE TABLE IF NOT EXISTS user_contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        contact_id UUID REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, contact_id)
      )
    `);

    // User blocked users table
    await query(`
      CREATE TABLE IF NOT EXISTS user_blocked_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        blocked_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, blocked_user_id)
      )
    `);

    // User locations table
    await query(`
      CREATE TABLE IF NOT EXISTS user_locations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        accuracy DECIMAL(10, 2),
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // User follows table
    await query(`
      CREATE TABLE IF NOT EXISTS user_follows (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        follower_id UUID REFERENCES users(id) ON DELETE CASCADE,
        following_id UUID REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(follower_id, following_id)
      )
    `);

    // Add missing columns to chats table if they don't exist
    try {
      await query(`
        ALTER TABLE chats 
        ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS last_message_content TEXT,
        ADD COLUMN IF NOT EXISTS last_message_sender_id UUID REFERENCES users(id)
      `);
      console.log('✅ Added missing columns to chats table');
    } catch (error) {
      console.log('⚠️ Chats table columns already exist or error:', error.message);
    }

    // Add missing firebase_uid column to users table if it doesn't exist
    try {
      await query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(255) UNIQUE
      `);
      console.log('✅ Added missing firebase_uid column to users table');
    } catch (error) {
      console.log('⚠️ users table firebase_uid column already exists or error:', error.message);
    }

    // Add missing last_updated column to user_locations table if it doesn't exist
    try {
      await query(`
        ALTER TABLE user_locations 
        ADD COLUMN IF NOT EXISTS last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `);
      console.log('✅ Added missing last_updated column to user_locations table');
    } catch (error) {
      console.log('⚠️ user_locations table column already exists or error:', error.message);
    }

    // Create indexes for better performance
    await query('CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)');
    await query('CREATE INDEX IF NOT EXISTS idx_chat_participants_chat_id ON chat_participants(chat_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_chat_participants_user_id ON chat_participants(user_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_signal_keys_user_id ON signal_keys(user_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_prekeys_user_id ON prekeys(user_id)');

    console.log('✅ Database migration completed successfully!');
  } catch (error) {
    console.error('❌ Database migration failed:', error);
    throw error;
  }
};

// Run migration if this file is executed directly
if (require.main === module) {
  createTables()
    .then(() => {
      console.log('🎉 Migration completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { createTables };
