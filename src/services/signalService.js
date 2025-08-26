const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Generate Signal Protocol keys
const generateSignalKeys = async () => {
  // Generate identity key pair
  const identityKeyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  // Generate prekeys
  const preKeys = [];
  const preKeyCount = parseInt(process.env.SIGNAL_PREKEY_COUNT) || 100;
  
  for (let i = 0; i < preKeyCount; i++) {
    const preKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    preKeys.push({
      id: i + 1,
      publicKey: preKeyPair.publicKey
    });
  }

  // Generate signed prekey
  const signedPreKeyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  // Sign the signed prekey with identity key
  const sign = crypto.createSign('SHA256');
  sign.update(signedPreKeyPair.publicKey);
  const signature = sign.sign(identityKeyPair.privateKey, 'base64');

  return {
    identityKey: {
      publicKey: identityKeyPair.publicKey,
      privateKey: identityKeyPair.privateKey
    },
    preKeys,
    signedPreKey: {
      id: 1,
      publicKey: signedPreKeyPair.publicKey,
      signature
    },
    registrationId: Math.floor(Math.random() * 1000000)
  };
};

// Encrypt message using Signal Protocol
const encryptMessage = async (message, recipientPublicKey, senderPrivateKey) => {
  try {
    // Generate ephemeral key
    const ephemeralKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    // Generate shared secret (simplified ECDH)
    const sharedSecret = crypto.diffieHellman({
      privateKey: senderPrivateKey,
      publicKey: recipientPublicKey
    });

    // Derive encryption key
    const key = crypto.pbkdf2Sync(sharedSecret, 'salt', 100000, 32, 'sha256');

    // Encrypt message
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', key);
    cipher.setAAD(Buffer.from('additional-data', 'utf8'));
    
    let encrypted = cipher.update(message, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted,
      ephemeralKey: ephemeralKeyPair.publicKey,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      counter: Date.now(),
      previousCounter: 0,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt message');
  }
};

// Decrypt message using Signal Protocol
const decryptMessage = async (encryptedMessage, senderPublicKey, recipientPrivateKey) => {
  try {
    // Reconstruct shared secret
    const sharedSecret = crypto.diffieHellman({
      privateKey: recipientPrivateKey,
      publicKey: senderPublicKey
    });

    // Derive decryption key
    const key = crypto.pbkdf2Sync(sharedSecret, 'salt', 100000, 32, 'sha256');

    // Decrypt message
    const iv = Buffer.from(encryptedMessage.iv, 'hex');
    const authTag = Buffer.from(encryptedMessage.authTag, 'hex');
    
    const decipher = crypto.createDecipher('aes-256-gcm', key);
    decipher.setAAD(Buffer.from('additional-data', 'utf8'));
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedMessage.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt message');
  }
};

// Generate prekey bundle for a user
const generatePrekeyBundle = async (userId) => {
  try {
    const preKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    return {
      id: Math.floor(Math.random() * 1000000),
      publicKey: preKeyPair.publicKey
    };
  } catch (error) {
    console.error('Prekey generation error:', error);
    throw new Error('Failed to generate prekey');
  }
};

module.exports = {
  generateSignalKeys,
  encryptMessage,
  decryptMessage,
  generatePrekeyBundle
};
