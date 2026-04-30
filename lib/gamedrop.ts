import { decryptField } from "./encryption";

export type BalanceResponse = {
  balance: number;
  draftBalance: number;
  isPostpaid: boolean;
  currency: { id: number; code: string };
  partnerId: number;
};

export async function checkGameDropBalance(encryptedToken: string): Promise<BalanceResponse> {
  const token = decryptField(encryptedToken);
  if (!token) throw new Error("Invalid GameDrop token");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch("https://partner.gamesdrop.io/api/v1/offers/balance", {
      headers: { Authorization: token },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`GameDrop API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}
