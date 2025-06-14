import crypto from 'crypto';

// Encryption configuration
const algorithm = 'aes-256-gcm';

// Single instance of encryption key that will be shared across the application
let encryptionKey = null;

// Initialize encryption key once
export function getEncryptionKey() {
  if (!encryptionKey) {
    encryptionKey = process.env.TOKEN_ENCRYPTION_KEY ? 
      crypto.scryptSync(process.env.TOKEN_ENCRYPTION_KEY, 'salt', 32) : 
      crypto.randomBytes(32);
    console.log('🔐 Encryption key initialized');
  }
  return encryptionKey;
}

export function encryptTokens(tokens) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  let encrypted = cipher.update(JSON.stringify(tokens), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

export function decryptTokens(encryptedData) {
  try {
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(
      algorithm, 
      key, 
      Buffer.from(encryptedData.iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('❌ Token decryption failed:', error.message);
    throw new Error('Failed to decrypt tokens. This may happen if the encryption key has changed.');
  }
}
