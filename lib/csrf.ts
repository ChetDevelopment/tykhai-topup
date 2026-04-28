import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const CSRF_SECRET = process.env.CSRF_SECRET || process.env.JWT_SECRET || "dev-csrf-secret-at-least-32-chars";
const CSRF_COOKIE = "tykhai_csrf";
const HEADER_NAME = "x-csrf-token";

// Generate a CSRF token
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Validate CSRF token
export function validateCsrfToken(token: string, sessionToken: string): boolean {
  if (!token || !sessionToken) return false;
  
  // Simple validation: token should exist and not be empty
  // In production, use HMAC-based validation
  try {
    const expected = crypto
      .createHmac("sha256", CSRF_SECRET)
      .update(sessionToken)
      .digest("hex");
    return crypto.timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

// Middleware to check CSRF for state-changing requests
export async function checkCsrf(req: NextRequest): Promise<NextResponse | null> {
  // Only check for state-changing methods
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(req.method || "")) {
    return null;
  }

  const token = req.headers.get(HEADER_NAME);
  const cookies = req.headers.get("cookie") || "";
  const sessionMatch = cookies.match(/tykhai_(admin|user)=([^;]+)/);
  
  if (!sessionMatch) {
    return NextResponse.json({ error: "CSRF: No session" }, { status: 403 });
  }
  
  if (!token) {
    return NextResponse.json({ error: "CSRF: Token missing" }, { status: 403 });
  }
  
  const isValid = validateCsrfToken(token, sessionMatch[2]);
  if (!isValid) {
    return NextResponse.json({ error: "CSRF: Invalid token" }, { status: 403 });
  }
  
  return null;
}

// Get CSRF token for client
export async function getCsrfToken(req: NextRequest): NextResponse {
  const cookies = req.headers.get("cookie") || "";
  const sessionMatch = cookies.match(/tykhai_(admin|user)=([^;]+)/);
  
  if (!sessionMatch) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }
  
  const token = generateCsrfToken();
  const expected = crypto
    .createHmac("sha256", CSRF_SECRET)
    .update(sessionMatch[2])
    .digest("hex");
  
  return NextResponse.json({ csrfToken: expected });
}
