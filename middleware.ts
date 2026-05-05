import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { rateLimit, RATE_LIMITS, checkIPBlock, blockIP } from "./lib/rate-limit";

const SESSION_COOKIE = "tykhai_admin";
const USER_COOKIE = "tykhai_user";

function getSecret() {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || (process.env.NODE_ENV === "development" ? "development_secret_key_at_least_32_characters_long" : null);
  if (!secret || secret.length < 32) return null;
  return new TextEncoder().encode(secret);
}

// Rate limiter instances
const loginLimiter = rateLimit(RATE_LIMITS.LOGIN);
const registerLimiter = rateLimit(RATE_LIMITS.REGISTER);
const paymentLimiter = rateLimit(RATE_LIMITS.PAYMENT);
const ordersLimiter = rateLimit(RATE_LIMITS.ORDERS);
const publicApiLimiter = rateLimit(RATE_LIMITS.PUBLIC_API);

// Security-focused middleware
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Check IP block first
  const ipBlockResponse = checkIPBlock(req);
  if (ipBlockResponse) return ipBlockResponse;

  // Apply rate limiting based on endpoint
  let rateLimitResponse = null;
  
  if (pathname.startsWith("/api/auth/signin") || pathname.startsWith("/api/auth/register")) {
    rateLimitResponse = await loginLimiter(req);
  } else if (pathname.startsWith("/api/payment")) {
    rateLimitResponse = await paymentLimiter(req);
  } else if (pathname.startsWith("/api/orders")) {
    rateLimitResponse = await ordersLimiter(req);
  } else if (pathname.startsWith("/api/")) {
    rateLimitResponse = await publicApiLimiter(req);
  }
  
  if (rateLimitResponse) {
    // Block IP after 3 rate limit violations
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
    blockIP(ip);
    return rateLimitResponse;
  }

  // Block suspicious requests early
  const userAgent = req.headers.get("user-agent") || "";
  if (!userAgent || userAgent.length < 10 || /bot|crawler|spider/i.test(userAgent)) {
    // Allow common good bots but block suspicious ones
    if (!/googlebot|bingbot|slackbot|twitterbot/i.test(userAgent)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  // Only guard /admin/* (except /admin/login itself)
  if (!pathname.startsWith("/admin") || pathname === "/admin/login") {
    return NextResponse.next();
  }

  // Also skip auth endpoints
  if (pathname.startsWith("/api/admin/auth")) {
    return NextResponse.next();
  }

  // For /api/admin/* we still want to verify token (except auth routes)
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = getSecret();

  if (!token || !secret) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.adminId) {
      throw new Error("Not an admin token");
    }
    return NextResponse.next();
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/api/:path*"],
};
