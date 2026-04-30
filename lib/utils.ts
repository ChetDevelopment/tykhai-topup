// Generate human-friendly order number: TY-XXXXXX
export function generateOrderNumber(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let n = "";
  for (let i = 0; i < 6; i++) {
    n += chars[Math.floor(Math.random() * chars.length)];
  }
  return `TY-${n}`;
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatKhr(amount: number): string {
  return `${Math.round(amount).toLocaleString("en-US")} ៛`;
}

export function calcKhr(usd: number, rate: number = 4100): number {
  return Math.round(usd * rate / 100) * 100; // round to nearest 100 KHR
}

// Validate UID format - strict: alphanumeric + dash/underscore only, 4-20 chars
// Prevents injection attacks (No < > " ' ; etc.)
export function isValidUid(uid: string): boolean {
  if (typeof uid !== "string") return false;
  const trimmed = uid.trim();
  // Only allow safe characters: alphanumeric, hyphens, underscores
  // Length: 4-20 characters
  return /^[a-zA-Z0-9-_]{4,20}$/.test(trimmed);
}

// Validate server zone id
export function isValidServerId(sid: string): boolean {
  return /^\d{1,5}$/.test(sid.trim());
}
