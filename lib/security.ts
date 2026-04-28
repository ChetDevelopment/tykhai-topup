import { NextRequest, NextResponse } from "next/server";

/**
 * Sanitize user input to prevent XSS attacks
 */
export function sanitizeInput(input: string, maxLength: number = 1000): string {
  if (typeof input !== "string") return "";
  
  return input
    .replace(/[<>]/g, "") // Remove < and >
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/on\w+=/gi, "") // Remove event handlers
    .trim()
    .slice(0, maxLength);
}

/**
 * Validate and sanitize email
 */
export function sanitizeEmail(email: string): string {
  if (typeof email !== "string") return "";
  return email
    .toLowerCase()
    .trim()
    .slice(0, 255);
}

/**
 * Validate UID format to prevent injection
 */
export function validateUid(uid: string): boolean {
  if (typeof uid !== "string") return false;
  // Only allow alphanumeric, hyphens, and underscores
  return /^[a-zA-Z0-9-_]{4,20}$/.test(uid);
}

/**
 * Validate server ID
 */
export function validateServerId(serverId: string): boolean {
  if (typeof serverId !== "string") return false;
  return /^[a-zA-Z0-9-_]{1,20}$/.test(serverId);
}

/**
 * Security headers for API responses
 */
export function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

/**
 * Check for suspicious patterns in request
 */
export function isSuspiciousRequest(req: NextRequest): boolean {
  const url = req.url;
  const userAgent = req.headers.get("user-agent") || "";
  
  // Check for common attack patterns in URL
  const suspiciousPatterns = [
    /\.\./,  // Path traversal
    /<script/i,  // XSS
    /union.*select/i,  // SQL injection
    /exec.*cmd/i,  // Command injection
  ];
  
  if (suspiciousPatterns.some(pattern => pattern.test(url))) {
    return true;
  }
  
  // Check for empty or suspicious user agent
  if (!userAgent || userAgent.length < 10) {
    return true;
  }
  
  return false;
}

/**
 * Create secure JSON response
 */
export function secureJson(data: any, status: number = 200): NextResponse {
  const response = NextResponse.json(data, { status });
  return addSecurityHeaders(response);
}

/**
 * Log security event
 */
export function logSecurityEvent(event: string, details: any, req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const timestamp = new Date().toISOString();
  
  console.warn(`[SECURITY] ${timestamp} | ${event} | IP: ${ip} |`, details);
}
