import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ENCRYPTION_KEY must be set and at least 32 characters long");
  }
  // Derive a 256-bit key from the secret
  return crypto.createHash("sha256").update(secret).digest();
}

export interface EncryptedData {
  iv: string;
  encrypted: string;
  tag: string;
  salt: string;
}

export function encrypt(text: string): EncryptedData {
  if (typeof text !== "string" || !text) {
    throw new Error("Invalid input for encryption");
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const tag = cipher.getAuthTag();
  
  return {
    iv: iv.toString("hex"),
    encrypted: encrypted,
    tag: tag.toString("hex"),
    salt: salt.toString("hex"),
  };
}

export function decrypt(encryptedData: EncryptedData): string {
  if (!encryptedData || typeof encryptedData !== "object") {
    throw new Error("Invalid encrypted data format");
  }

  const { iv, encrypted, tag, salt } = encryptedData;
  
  if (!iv || !encrypted || !tag) {
    throw new Error("Missing required encryption fields");
  }

  const key = getEncryptionKey();
  
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, "hex")
  );
  
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}

export function encryptField(value: string | null | undefined): string | null {
  if (!value) return null;
  const encrypted = encrypt(value);
  return JSON.stringify(encrypted);
}

export function decryptField(encryptedStr: string | null | undefined): string | null {
  if (!encryptedStr) return null;
  try {
    const encryptedData = JSON.parse(encryptedStr) as EncryptedData;
    return decrypt(encryptedData);
  } catch {
    return null;
  }
}

export function generateSecureRef(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

export function generateSecureToken(length: number = 64): string {
  return crypto.randomBytes(length).toString("hex");
}

export function hashSha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expectedSignature, "hex")
  );
}

export function createWebhookSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  return hmac.digest("hex");
}

export function md5ToSha256(md5Hash: string): string {
  return crypto.createHash("sha256").update(md5Hash).digest("hex");
}
