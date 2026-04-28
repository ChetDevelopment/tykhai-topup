const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

// Manual .env loading
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

loadEnv();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  console.error('ERROR: ENCRYPTION_KEY must be set and at least 32 characters long');
  process.exit(1);
}

function getEncryptionKey() {
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
}

function encrypt(text) {
  if (typeof text !== 'string' || !text) return null;
  
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const salt = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  
  return JSON.stringify({
    iv: iv.toString('hex'),
    encrypted: encrypted,
    tag: tag.toString('hex'),
    salt: salt.toString('hex')
  });
}

async function encryptEmails() {
  console.log('Encrypting User emails...');
  const users = await prisma.user.findMany();
  let encrypted = 0;
  
  for (const user of users) {
    if (!user.email) continue;
    
    try {
      JSON.parse(user.email);
      continue;
    } catch {
      const encryptedEmail = encrypt(user.email);
      if (encryptedEmail) {
        await prisma.user.update({
          where: { id: user.id },
          data: { email: encryptedEmail }
        });
        encrypted++;
      }
    }
  }
  console.log(`Encrypted ${encrypted} user emails`);
  
  console.log('Encrypting Admin emails...');
  const admins = await prisma.admin.findMany();
  encrypted = 0;
  
  for (const admin of admins) {
    if (!admin.email) continue;
    
    try {
      JSON.parse(admin.email);
      continue;
    } catch {
      const encryptedEmail = encrypt(admin.email);
      if (encryptedEmail) {
        await prisma.admin.update({
          where: { id: admin.id },
          data: { email: encryptedEmail }
        });
        encrypted++;
      }
    }
  }
  console.log(`Encrypted ${encrypted} admin emails`);
}

async function encryptSettings() {
  console.log('Encrypting Settings sensitive fields...');
  const settings = await prisma.settings.findFirst();
  
  if (!settings) {
    console.log('No settings found');
    return;
  }
  
  const updates = {};
  if (settings.telegramBotToken) {
    try {
      JSON.parse(settings.telegramBotToken);
    } catch {
      updates.telegramBotToken = encrypt(settings.telegramBotToken);
    }
  }
  
  if (settings.telegramChatId) {
    try {
      JSON.parse(settings.telegramChatId);
    } catch {
      updates.telegramChatId = encrypt(settings.telegramChatId);
    }
  }
  
  if (Object.keys(updates).length > 0) {
    await prisma.settings.update({
      where: { id: settings.id },
      data: updates
    });
    console.log('Encrypted settings fields');
  } else {
    console.log('Settings already encrypted');
  }
}

async function main() {
  const command = process.argv[2];
  
  if (command === 'encrypt-emails') {
    await encryptEmails();
  } else if (command === 'encrypt-settings') {
    await encryptSettings();
  } else if (command === 'encrypt-all') {
    await encryptEmails();
    await encryptSettings();
  } else {
    console.log('Usage: node encrypt-db-fields.js [encrypt-emails|encrypt-settings|encrypt-all]');
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
