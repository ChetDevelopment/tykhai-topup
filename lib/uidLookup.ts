/**
 * Game-specific UID → in-game nickname lookup.
 *
 * Uses CamRapidSecure API at v1.camrapidx.com for reliable validation.
 * Every function has a timeout and catches all errors → returns null.
 */

// ---------- helpers ----------

interface CamRapidResponse {
  status?: string;
  username?: string;
  user_id?: string;
  message?: string;
}

async function fetchCamRapid(
  gameFile: string,
  uid: string,
  zoneId?: string,
  timeoutMs = 6000,
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let url = `https://v1.camrapidx.com/validate_user/${gameFile}.php?UserID=${encodeURIComponent(uid)}`;
    if (zoneId) url += `&ZoneID=${encodeURIComponent(zoneId)}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Ty Khai TopUp/1.0",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return null;

    const data: CamRapidResponse = await res.json();
    if (data.status === "APPROVED" && data.username) return data.username;
    return null;
  } catch {
    return null;
  }
}

// ---------- per-game lookups ----------

export async function lookupMobileLegends(
  uid: string,
  zone: string,
): Promise<string | null> {
  return fetchCamRapid("Mobile_Legends_KH", uid, zone);
}

export async function lookupFreeFire(uid: string): Promise<string | null> {
  return fetchCamRapid("FreeFire_Global", uid);
}

export async function lookupGenshin(
  uid: string,
  _server?: string,
): Promise<string | null> {
  return fetchCamRapid("Genshin_Impact", uid);
}

export async function lookupHonkaiStarRail(
  uid: string,
  _server?: string,
): Promise<string | null> {
  return fetchCamRapid("Honkai_Star_Rail", uid);
}

// ---------- router ----------

/**
 * Looks up the in-game nickname for a given game + UID + optional server.
 * Returns the nickname string or null if lookup is unsupported / fails.
 */
export async function lookupNickname(
  gameSlug: string,
  uid: string,
  server?: string,
): Promise<string | null> {
  switch (gameSlug) {
    case "mobile-legends":
      return server ? lookupMobileLegends(uid, server) : null;
    case "free-fire":
      return lookupFreeFire(uid);
    case "genshin-impact":
      return lookupGenshin(uid, server);
    case "honkai-star-rail":
      return lookupHonkaiStarRail(uid, server);
    default:
      return null;
  }
}
