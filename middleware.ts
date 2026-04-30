import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "tykhai_admin";
const USER_COOKIE = "tykhai_user";

function getSecret() {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || (process.env.NODE_ENV === "development" ? "development_secret_key_at_least_32_characters_long" : null);
  if (!secret || secret.length < 32) return null;
  return new TextEncoder().encode(secret);
}

// Security-focused middleware
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
