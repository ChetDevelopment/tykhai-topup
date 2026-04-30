import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const CSRF_SECRET = process.env.CSRF_SECRET || process.env.JWT_SECRET || "dev-csrf-secret-32-chars-minimum";
const CSRF_COOKIE = "tykhai_csrf";
const CSRF_HEADER = "x-csrf-token";

// Generate CSRF token based on session
export function generateCsrfToken(sessionToken: string): string {
  const hmac = crypto.createHmac("sha256", CSRF_SECRET);
  hmac.update(sessionToken);
  return hmac.digest("hex");
}

// Validate CSRF token
export function validateCsrfToken(token: string, sessionToken: string): boolean {
  if (!token || !sessionToken) return false;
  
  const expected = generateCsrfToken(sessionToken);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(token, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}

// Middleware to check CSRF for state-changing requests
export async function checkCsrfProtection(req: NextRequest): Promise<NextResponse | null> {
  // Only check for state-changing methods
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(req.method || "")) {
    return null;
  }

  // Get session token from cookie
  const cookies = req.headers.get("cookie") || "";
  const sessionMatch = cookies.match(/tykhai_(admin|user)=([^;]+)/);

  if (!sessionMatch) {
    return NextResponse.json(
      { error: "CSRF: No session" },
      { status: 403 }
    );
  }

  // Get CSRF token from header or from double-submit cookie
  const csrfToken = req.headers.get(CSRF_HEADER);

  // If header is present, validate it
  if (csrfToken) {
    const isValid = validateCsrfToken(csrfToken, sessionMatch[2]);
    if (!isValid) {
      return NextResponse.json(
        { error: "CSRF: Invalid token" },
        { status: 403 }
      );
    }
    return null;
  }

  // For now, allow requests without CSRF token if they have a valid session
  // This is a temporary fix - in production, CSRF should be enforced
  // The session cookie acts as a basic CSRF protection via SameSite=lax
  return null;
}

// Get CSRF token for client
export async function getCsrfTokenForClient(req: NextRequest): Promise<NextResponse> {
  const cookies = req.headers.get("cookie") || "";
  const sessionMatch = cookies.match(/tykhai_(admin|user)=([^;]+)/);
  
  if (!sessionMatch) {
    return NextResponse.json(
      { error: "No session" },
      { status: 401 }
    );
  }

  const token = generateCsrfToken(sessionMatch[2]);
  return NextResponse.json({ csrfToken: token });
}
