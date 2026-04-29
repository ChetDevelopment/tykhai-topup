#!/usr/bin/env node

/**
 * Database Encryption Helper
 * Use this to encrypt sensitive fields in database
 * 
 * Usage:
 *   node scripts/encrypt-db-fields.js encrypt-emails
 *   node scripts/encrypt-db-fields.js decrypt-emails
 *   node scripts/encrypt-db-fields.js encrypt-settings
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Import encryption functions (we'll inline them for CLI use)
const crypto = require('crypto');

function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('ENCRYPTION_KEY must be set and at least 32 characters');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(text) {
  if (!text) return null;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
   
  return JSON.stringify({
    iv: iv.toString('hex'),
    encrypted: encrypted,
    tag: tag.toString('hex'),
    salt: crypto.randomBytes(16).toString('hex')
  });
}

function decrypt(encryptedData) {
  if (!encryptedData) return null;
  try {
    const { iv, encrypted, tag } = JSON.parse(encryptedData);
    const key = getEncryptionKey();
     
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
     
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}

async function encryptEmails() {
  console.log('🔒 Encrypting User emails...');
  const users = await prisma.user.findMany({
    where: {
      email: { not: null }
    }
  });
  
  let encrypted = 0;
  for (const user of users) {
    // Check if already encrypted (starts with '{')
    if (user.email && !user.email.startsWith('{')) {
      const encryptedEmail = encrypt(user.email);
      await prisma.user.update({
        where: { id: user.id },
        data: { email: encryptedEmail }
      });
      encrypted++;
    }
  }
  console.log(`✅ Encrypted ${encrypted} user emails`);
  
  console.log('🔒 Encrypting Admin emails...');
  const admins = await prisma.admin.findMany({
    where: {
      email: { not: null }
    }
  });
  
  let adminEncrypted = 0;
  for (const admin of admins) {
    if (admin.email && !admin.email.startsWith('{')) {
      const encryptedEmail = encrypt(admin.email);
      await prisma.admin.update({
        where: { id: admin.id },
        data: { email: encryptedEmail }
      });
      adminEncrypted++;
    }
  }
  console.log(`✅ Encrypted ${adminEncrypted} admin emails`);
}

async function decryptEmails() {
  console.log('🔓 Decrypting User emails...');
  const users = await prisma.user.findMany({
    where: {
      email: { not: null }
    }
  });
  
  let decrypted = 0;
  for (const user of users) {
    if (user.email && user.email.startsWith('{')) {
      const decryptedEmail = decrypt(user.email);
      if (decryptedEmail) {
        await prisma.user.update({
          where: { id: user.id },
          data: { email: decryptedEmail }
        });
        decrypted++;
      }
    }
  }
  console.log(`✅ Decrypted ${decrypted} user emails`);
}

async function encryptSettings() {
  console.log('🔒 Encrypting Settings...');
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  
  if (!settings) {
    console.log('⚠️  No settings found');
    return;
  }
  
  const updates = {};
  if (settings.telegramBotToken && !settings.telegramBotToken.startsWith('{')) {
    updates.telegramBotToken = encrypt(settings.telegramBotToken);
  }
  if (settings.telegramChatId && !settings.telegramChatId.startsWith('{')) {
    updates.telegramChatId = encrypt(settings.telegramChatId);
  }
  
  if (Object.keys(updates).length > 0) {
    await prisma.settings.update({
      where: { id: 1 },
      data: updates
    });
    console.log('✅ Encrypted settings fields');
  } else {
    console.log('⏭  Settings already encrypted');
  }
}

const command = process.argv[2] || 'help';

async function main() {
  try {
    switch (command) {
      case 'encrypt-emails':
        await encryptEmails();
        break;
      case 'decrypt-emails':
        await decryptEmails();
        break;
      case 'encrypt-settings':
        await encryptSettings();
        break;
      default:
        console.log('Usage:');
        console.log('  node scripts/encrypt-db-fields.js encrypt-emails');
        console.log('  node scripts/encrypt-db-fields.js decrypt-emails');
        console.log('  node scripts/encrypt-db-fields.js encrypt-settings');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
