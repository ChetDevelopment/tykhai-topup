import { NextRequest, NextResponse } from "next/server";

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

// Rate limit configurations by endpoint type
export const RATE_LIMITS = {
  LOGIN: { windowMs: 60 * 1000, maxRequests: 5 },
  REGISTER: { windowMs: 60 * 1000, maxRequests: 3 },
  ORDERS: { windowMs: 60 * 1000, maxRequests: 10 },
  PUBLIC_API: { windowMs: 60 * 1000, maxRequests: 60 },
  ADMIN_API: { windowMs: 60 * 1000, maxRequests: 30 },
  USER_API: { windowMs: 60 * 1000, maxRequests: 30 },
  WEBHOOK: { windowMs: 60 * 1000, maxRequests: 100 },
};

export interface RateLimitConfig {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (req: NextRequest) => string;
}

export function rateLimit(config: RateLimitConfig = {}) {
  const {
    windowMs = 60 * 1000,
    maxRequests = 60,
    keyGenerator = (req) => {
      const forwarded = req.headers.get("x-forwarded-for");
      const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
      return `${ip}:${req.nextUrl.pathname}`;
    },
  } = config;

  return async function rateLimitMiddleware(req: NextRequest): Promise<NextResponse | null> {
    const key = keyGenerator(req);
    const now = Date.now();

    if (!store[key] || store[key].resetTime < now) {
      store[key] = { count: 1, resetTime: now + windowMs };
      return null;
    }

    store[key].count++;

    if (store[key].count > maxRequests) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { 
          status: 429,
          headers: {
            "Retry-After": Math.ceil((store[key].resetTime - now) / 1000).toString(),
            "X-RateLimit-Limit": maxRequests.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": new Date(store[key].resetTime).toISOString(),
          }
        }
      );
    }

    return null;
  };
}

// Block IP temporarily after too many violations
const blockedIPs: Map<string, number> = new Map();
const BLOCK_DURATION = 15 * 60 * 1000; // 15 minutes

export function checkIPBlock(req: NextRequest): NextResponse | null {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  
  const blockedUntil = blockedIPs.get(ip);
  if (blockedUntil && blockedUntil > Date.now()) {
    return NextResponse.json(
      { error: "IP temporarily blocked due to suspicious activity" },
      { status: 403 }
    );
  }
  return null;
}

export function blockIP(ip: string) {
  blockedIPs.set(ip, Date.now() + BLOCK_DURATION);
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach((key) => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
  // Cleanup expired blocks
  for (const [ip, until] of blockedIPs.entries()) {
    if (until < now) blockedIPs.delete(ip);
  }
}, 60 * 1000);
