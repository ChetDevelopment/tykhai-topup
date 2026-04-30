import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { z } from "zod";

export const runtime = "nodejs";

// In-game ID → nickname check.
// Upstream: https://api.isan.eu.org (community-run; no auth, best-effort).
//
// Route is public (used by the checkout form) but intentionally narrow:
// we only forward a fixed set of game slugs and strip out anything else.

const schema = z.object({
  slug: z.enum(["mobile-legends", "genshin-impact", "honkai-star-rail", "free-fire"]),
  uid: z.string().min(4, "UID must be at least 4 characters").max(20, "UID too long"),
  serverId: z.string().min(1).max(6).optional(),
});

// Safe parsing: accept both serverId as string or undefined
function sanitizeServerId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// Maps our game slugs → isan endpoint path + whether a server param is needed.
const UPSTREAM: Record<
  z.infer<typeof schema>["slug"],
  { path: string; needsServer: boolean }
> = {
  "mobile-legends":    { path: "/nickname/ml",      needsServer: true  },
  "genshin-impact":    { path: "/nickname/genshin", needsServer: true  },
  "honkai-star-rail":  { path: "/nickname/starrail", needsServer: true },
  "free-fire":         { path: "/nickname/ff",      needsServer: false },
};

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Debug logging for production
  console.log("[check-id] Request body:", JSON.stringify(body));

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.error("[check-id] Validation error:", parsed.error.issues);
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }
  const { slug, uid, serverId: rawServerId } = parsed.data;
  
  // Handle serverId: convert empty string to undefined
  const serverId = rawServerId && rawServerId.trim().length > 0 ? rawServerId.trim() : undefined;
  
  console.log("[check-id] Parsed:", { slug, uid, serverId });
  
  // Validate UID format based on game
  // Mobile Legends: 5-12 digits
  // Free Fire, Genshin, HSR: use general validation
  if (slug === "mobile-legends") {
    if (!/^\d{5,12}$/.test(uid.trim())) {
      return NextResponse.json(
        { success: false, error: "Mobile Legends UID must be 5-12 digits" },
        { status: 400 }
      );
    }
  } else {
    // General validation for other games (already done by schema)
    if (!/^[a-zA-Z0-9-_]{4,20}$/.test(uid.trim())) {
      return NextResponse.json(
        { success: false, error: "Invalid UID format (4-20 characters, letters/digits only)" },
        { status: 400 }
      );
    }
  }

  // Free Fire uses a different upstream API (camrapidx)
  if (slug === "free-fire") {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(
        `https://v1.camrapidx.com/validate_user/FreeFire_LevelUpPass.php?UserID=${encodeURIComponent(uid)}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": "Ty Khai TopUp/1.0",
          },
          cache: "no-store",
          signal: controller.signal,
        },
      );
      clearTimeout(timeout);

      if (!res.ok) {
        return NextResponse.json(
          { success: false, error: "Lookup failed" },
          { status: 502 }
        );
      }

      const data: unknown = await res.json().catch(() => null);
      if (!data || typeof data !== "object") {
        return NextResponse.json(
          { success: false, error: "Invalid response" },
          { status: 502 }
        );
      }

      const d = data as { status?: string; username?: string };
      if (d.status !== "APPROVED" || !d.username) {
        return NextResponse.json(
          { success: false, error: "Player not found — check your ID." },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        name: d.username,
        uid,
        serverId: null,
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return NextResponse.json(
        { success: false, error: aborted ? "Lookup timed out" : "Network error" },
        { status: 504 }
      );
    }
  }

  const cfg = UPSTREAM[slug];

  if (cfg.needsServer && !serverId) {
    return NextResponse.json(
      { success: false, error: "Server/Zone ID is required for this game" },
      { status: 400 }
    );
  }

  // api.isan.eu.org uses path-style params, not query string:
  //   /nickname/ml/{userId}/{zoneId}
  //   /nickname/genshin/{uid}/{server}
  const segments = [encodeURIComponent(uid)];
  if (serverId) segments.push(encodeURIComponent(serverId));
  const upstreamUrl = `https://api.isan.eu.org${cfg.path}/${segments.join("/")}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(upstreamUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data: unknown = await res.json().catch(() => null);
    if (!data || typeof data !== "object") {
      return NextResponse.json(
        { success: false, error: "Upstream lookup failed" },
        { status: 502 }
      );
    }

    // isan.eu.org shape: { success: bool, name?: string, message?: string }
    const d = data as { success?: boolean; name?: string; message?: string };
    if (!d.success || !d.name) {
      // Upstream validates the id/server combo — treat any non-success as "not found".
      const msg = d.message && d.message.toLowerCase() !== "bad request"
        ? d.message
        : "Player not found — check your ID and zone.";
      return NextResponse.json(
        { success: false, error: msg },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      name: d.name,
      uid,
      serverId: serverId ?? null,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      { success: false, error: aborted ? "Lookup timed out" : "Network error" },
      { status: 504 }
    );
  }
}

