/**
 * Environment Variable Validation
 * Validates all required env vars at startup
 */

export interface EnvConfig {
  JWT_SECRET: string;
  NEXTAUTH_SECRET: string;
  ENCRYPTION_KEY: string;
  DATABASE_URL: string;
  NEXT_PUBLIC_BASE_URL: string;
  // Optional but validated if present
  UPSTASH_REDIS_URL?: string;
  UPSTASH_REDIS_TOKEN?: string;
  BAKONG_TOKEN?: string;
  BAKONG_WEBHOOK_SECRET?: string;
  SMTP_HOST?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
}

export function validateEnv(): EnvConfig {
  const errors: string[] = [];

  // Required variables
  const JWT_SECRET = process.env.JWT_SECRET;
  const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
  const DATABASE_URL = process.env.DATABASE_URL;
  const NEXT_PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

  // Check JWT_SECRET
  if (!JWT_SECRET) {
    errors.push("JWT_SECRET is required");
  } else if (JWT_SECRET.length < 32) {
    errors.push("JWT_SECRET must be at least 32 characters");
  } else if (JWT_SECRET === "development_secret_key_at_least_32_characters_long") {
    errors.push("JWT_SECRET must not be the default development value");
  }

  // Check NEXTAUTH_SECRET
  if (!NEXTAUTH_SECRET) {
    errors.push("NEXTAUTH_SECRET is required");
  } else if (NEXTAUTH_SECRET.length < 32) {
    errors.push("NEXTAUTH_SECRET must be at least 32 characters");
  }

  // Check ENCRYPTION_KEY
  if (!ENCRYPTION_KEY) {
    errors.push("ENCRYPTION_KEY is required");
  } else if (ENCRYPTION_KEY.length < 32) {
    errors.push("ENCRYPTION_KEY must be at least 32 characters");
  } else if (ENCRYPTION_KEY === "development_secret_key_at_least_32_characters_long") {
    errors.push("ENCRYPTION_KEY must not be the default development value");
  }

  // Check DATABASE_URL
  if (!DATABASE_URL) {
    errors.push("DATABASE_URL is required");
  } else if (!DATABASE_URL.startsWith("postgresql://") && !DATABASE_URL.startsWith("postgres://")) {
    errors.push("DATABASE_URL must be a valid PostgreSQL connection string");
  }

  // Check NEXT_PUBLIC_BASE_URL
  if (!NEXT_PUBLIC_BASE_URL) {
    errors.push("NEXT_PUBLIC_BASE_URL is required");
  } else if (!NEXT_PUBLIC_BASE_URL.startsWith("http")) {
    errors.push("NEXT_PUBLIC_BASE_URL must be a valid URL");
  }

  // If any errors, throw fatal error
  if (errors.length > 0) {
    const message = `FATAL: Environment validation failed:\n${errors.map(e => `  - ${e}`).join("\n")}`;
    console.error(message);
    
    // In production, crash the app
    if (process.env.NODE_ENV === "production") {
      throw new Error(message);
    } else {
      console.warn("⚠️  Continuing in development mode despite validation errors");
    }
  }

  return {
    JWT_SECRET,
    NEXTAUTH_SECRET,
    ENCRYPTION_KEY,
    DATABASE_URL,
    NEXT_PUBLIC_BASE_URL,
    UPSTASH_REDIS_URL: process.env.UPSTASH_REDIS_URL,
    UPSTASH_REDIS_TOKEN: process.env.UPSTASH_REDIS_TOKEN,
    BAKONG_TOKEN: process.env.BAKONG_TOKEN,
    BAKONG_WEBHOOK_SECRET: process.env.BAKONG_WEBHOOK_SECRET,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
  };
}

// Auto-validate in production
if (typeof window === "undefined") {
  try {
    validateEnv();
    console.log("✅ Environment validation passed");
  } catch (error) {
    console.error("❌ Environment validation failed:", error);
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  }
}
