import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bulkPricingSchema = z.object({
  gameId: z.string().min(1),
  value: z.number().positive(),
  type: z.enum(["percentage", "fixed"]),
  direction: z.enum(["up", "down"]),
  targetFields: z.array(z.enum(["priceUsd", "resellerPriceUsd"])).min(1),
  rounding: z.enum(["none", "99", "95", "00"]),
});

function applyRounding(price: number, rounding: string): number {
  if (rounding === "none") return Math.round(price * 100) / 100;
  
  const integerPart = Math.floor(price);
  if (rounding === "99") return integerPart + 0.99;
  if (rounding === "95") return integerPart + 0.95;
  if (rounding === "00") return Math.round(price);
  
  return price;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = bulkPricingSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data", details: parsed.error }, { status: 400 });
    }

    const { gameId, value, type, direction, targetFields, rounding } = parsed.data;

    // Get all products for this game
    const products = await prisma.product.findMany({
      where: { gameId }
    });

    const updates = products.map(p => {
      const data: any = {};
      
      targetFields.forEach(field => {
        const currentPrice = (p as any)[field];
        if (currentPrice === null || currentPrice === undefined) return;

        let newPrice: number;
        if (type === "percentage") {
          const factor = direction === "up" ? (1 + value/100) : (1 - value/100);
          newPrice = currentPrice * factor;
        } else {
          newPrice = direction === "up" ? (currentPrice + value) : (currentPrice - value);
        }

        // Ensure price doesn't go below 0.01
        newPrice = Math.max(0.01, newPrice);
        
        // Apply rounding
        data[field] = applyRounding(newPrice, rounding);
      });

      if (Object.keys(data).length === 0) return null;

      return prisma.product.update({
        where: { id: p.id },
        data
      });
    }).filter(Boolean) as any[];

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }

    return NextResponse.json({ ok: true, updatedCount: updates.length });
  } catch (err) {
    console.error("[bulk-pricing] error:", err);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}
