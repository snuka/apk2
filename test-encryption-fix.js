import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { encryptTokens, decryptTokens } from './utils/encryption.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN_FILE = path.join(__dirname, 'google_tokens.json');

async function testEncryptionFix() {
  console.log('🔐 Testing encryption fix...\n');

  // Check if token file exists
  if (await fs.pathExists(TOKEN_FILE)) {
    console.log('✅ Token file exists');
    
    try {
      const data = await fs.readJson(TOKEN_FILE);
      console.log('📄 Token file contents:');
      console.log('  - Has encrypted tokens:', !!data.tokens);
      console.log('  - Last synced:', data.lastSynced);
      console.log('  - Email:', data.email || 'Not stored');
      
      // Try to decrypt tokens
      console.log('\n🔓 Attempting to decrypt tokens...');
      try {
        const decryptedTokens = decryptTokens(data.tokens);
        console.log('✅ Tokens decrypted successfully!');
        console.log('  - Has access_token:', !!decryptedTokens.access_token);
        console.log('  - Has refresh_token:', !!decryptedTokens.refresh_token);
        console.log('  - Token type:', decryptedTokens.token_type);
        console.log('  - Expiry date:', new Date(decryptedTokens.expiry_date).toISOString());
        
        // Check if tokens are expired
        if (decryptedTokens.expiry_date && decryptedTokens.expiry_date <= Date.now()) {
          console.log('⚠️  Tokens are expired and will need to be refreshed');
        } else {
          console.log('✅ Tokens are still valid');
        }
        
      } catch (decryptError) {
        console.error('❌ Failed to decrypt tokens:', decryptError.message);
        console.log('\n⚠️  This is likely because the tokens were encrypted with a different key.');
        console.log('💡 Solution: You need to re-authenticate through the admin panel:');
        console.log('   1. Go to http://localhost:3000/admin');
        console.log('   2. Disconnect Google Calendar (if connected)');
        console.log('   3. Connect Google Calendar again');
        console.log('   This will generate new tokens with the correct encryption key.\n');
      }
      
    } catch (error) {
      console.error('❌ Failed to read token file:', error.message);
    }
  } else {
    console.log('❌ Token file does not exist');
    console.log('💡 You need to connect Google Calendar through the admin panel first');
  }

  // Test encryption/decryption with new data
  console.log('\n🧪 Testing encryption/decryption with sample data...');
  const sampleTokens = {
    access_token: 'test_access_token',
    refresh_token: 'test_refresh_token',
    token_type: 'Bearer',
    expiry_date: Date.now() + 3600000
  };

  try {
    const encrypted = encryptTokens(sampleTokens);
    console.log('✅ Sample tokens encrypted successfully');
    
    const decrypted = decryptTokens(encrypted);
    console.log('✅ Sample tokens decrypted successfully');
    
    if (JSON.stringify(sampleTokens) === JSON.stringify(decrypted)) {
      console.log('✅ Encryption/decryption working correctly!\n');
    } else {
      console.log('❌ Decrypted data does not match original\n');
    }
  } catch (error) {
    console.error('❌ Encryption/decryption test failed:', error.message);
  }
}

testEncryptionFix().catch(console.error);
