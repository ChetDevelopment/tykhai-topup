import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";

import { generateOrderNumber, isValidUid, calcKhr } from "@/lib/utils";
import { initiatePayment } from "@/lib/payment";
import { PaymentMethod, PaymentCurrency } from "@/lib/payment-types";
import { getCurrentUser, updateUserTotalSpent } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isRealEmail } from "@/lib/email-validator";
import { checkIPBlock, rateLimit } from "@/lib/rate-limit";
import { encryptField, hashSha256 } from "@/lib/encryption";
import { CreateOrderSchema } from "@/lib/payment-types";

const orderRateLimit = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 10,
});

export async function POST(req: NextRequest) {
  const ipBlocked = checkIPBlock(req);
  if (ipBlocked) return ipBlocked;

  const rateLimitResult = await orderRateLimit(req);
  if (rateLimitResult) return rateLimitResult;

  try {
    const body = await req.json();
    const parsed = CreateOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = parsed.data;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    // Validate email
    if (data.customerEmail) {
      const emailValid = await isRealEmail(data.customerEmail);
      if (!emailValid) {
        return NextResponse.json(
          { error: "Please use a real email address" },
          { status: 400 }
        );
      }
    }

    if (!isValidUid(data.playerUid)) {
      return NextResponse.json({ error: "Invalid UID format" }, { status: 400 });
    }

    // Check maintenance mode
    const maintSettings = await prisma.settings.findUnique({ where: { id: 1 } });
    if (maintSettings?.maintenanceMode) {
      return NextResponse.json(
        { error: maintSettings.maintenanceMessage || "Ordering is temporarily disabled for maintenance." },
        { status: 503 }
      );
    }

    // Check system status (balance-based pause)
    if (maintSettings?.systemStatus === "PAUSED") {
      const msg = maintSettings.pauseReason === "LOW_BALANCE"
        ? "Top-up service temporarily unavailable due to low balance. Please try again later."
        : maintSettings.maintenanceMessage || "Service temporarily unavailable. Please try again later.";
      return NextResponse.json({ error: msg }, { status: 503 });
    }

    // Check banlist
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const userAgent = req.headers.get("user-agent") ?? "unknown";
    const banCandidates = [
      { type: "email" as const, value: data.customerEmail?.toLowerCase() },
      { type: "phone" as const, value: data.customerPhone?.toLowerCase() },
      { type: "ip" as const, value: ipAddress.toLowerCase() },
      { type: "uid" as const, value: data.playerUid.toLowerCase() },
    ].filter((c): c is { type: "email" | "phone" | "ip" | "uid"; value: string } => !!c.value);

    if (banCandidates.length > 0) {
      const blocked = await prisma.blockedIdentity.findFirst({
        where: { OR: banCandidates.map((c) => ({ type: c.type, value: c.value })) },
      });
      if (blocked) {
        return NextResponse.json(
          { error: "This order cannot be processed. Contact support if you believe this is a mistake." },
          { status: 403 }
        );
      }
    }

    // Idempotency check
    if (data.idempotencyKey) {
      const existingOrder = await prisma.order.findFirst({
        where: { paymentRef: data.idempotencyKey },
      });
      if (existingOrder) {
        return NextResponse.json({
          orderNumber: existingOrder.orderNumber,
          duplicate: true,
          redirectUrl: `${baseUrl}/order?number=${existingOrder.orderNumber}`,
        });
      }
    }

    // Validate game + product
    const [game, product, settings] = await Promise.all([
      prisma.game.findUnique({ where: { id: data.gameId } }),
      prisma.product.findUnique({ where: { id: data.productId } }),
      prisma.settings.findUnique({ where: { id: 1 } }),
    ]);

    if (!game || !game.active) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }
    if (!product || !product.active || product.gameId !== game.id) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (game.requiresServer && !data.serverId) {
      return NextResponse.json({ error: "Server is required for this game" }, { status: 400 });
    }

    const exchangeRate = settings?.exchangeRate ?? 4100;

    // Create order number
    const orderNumber = generateOrderNumber();
    const user = await getCurrentUser();
    const idempotencyKey = req.headers.get("x-idempotency-key") || data.idempotencyKey;
    const idempotencyHash = idempotencyKey
      ? hashSha256(idempotencyKey).slice(0, 64)
      : null;

    if (data.paymentMethod === "WALLET" && !user) {
      return NextResponse.json(
        { error: "Please login to use wallet payment" },
        { status: 400 }
      );
    }

    if (idempotencyHash) {
      const existing = await prisma.order.findFirst({
        where: {
          OR: [{ paymentRefEnc: idempotencyHash }, { paymentRef: idempotencyHash }],
        },
      });
      if (existing) {
        const redirectUrl =
          existing.status === "PENDING"
            ? `${baseUrl}/checkout/${existing.orderNumber}`
            : `${baseUrl}/order?number=${existing.orderNumber}`;
        return NextResponse.json({
          orderNumber: existing.orderNumber,
          duplicate: true,
          redirectUrl,
        });
      }
    }

    // Promo code handling
    let promoCodeId: string | null = null;
    let discountUsd = 0;
    let finalPrice = product.priceUsd;

    if (data.promoCode) {
      const promo = await prisma.promoCode.findUnique({
        where: { code: data.promoCode.toUpperCase().trim() },
      });
      if (
        promo &&
        promo.active &&
        (!promo.expiresAt || promo.expiresAt >= new Date()) &&
        (promo.maxUses === 0 || promo.usedCount < promo.maxUses) &&
        product.priceUsd >= promo.minOrderUsd
      ) {
        discountUsd =
          promo.discountType === "PERCENT"
            ? (product.priceUsd * promo.discountValue) / 100
            : promo.discountValue;
        discountUsd = Math.min(discountUsd, product.priceUsd);
        discountUsd = Math.round(discountUsd * 100) / 100;
        finalPrice = Math.round((product.priceUsd - discountUsd) * 100) / 100;
        promoCodeId = promo.id;

        await prisma.promoCode.update({
          where: { id: promo.id },
          data: { usedCount: { increment: 1 } },
        });
      }
    }

    // Automatic 2% Member Discount (One-time per product)
    if (user) {
      const hasBoughtBefore = await prisma.order.findFirst({
        where: {
          userId: user.userId,
          productId: product.id,
          status: { in: ["PAID", "DELIVERED", "PROCESSING"] },
        },
      });

      if (!hasBoughtBefore) {
        const memberDiscount = Math.round((finalPrice * 0.02) * 100) / 100;
        finalPrice = Math.round((finalPrice - memberDiscount) * 100) / 100;
        discountUsd = Math.round((discountUsd + memberDiscount) * 100) / 100;
      }
    }

    // Points redemption (100 points = $1 discount)
    let pointsUsed = 0;
    let pointsDiscount = 0;
    if (data.usePoints && data.usePoints > 0 && user) {
      const pointsBalance = user.pointsBalance || 0;
      const maxPoints = Math.min(data.usePoints, pointsBalance);
      pointsUsed = maxPoints;
      pointsDiscount = Math.round((maxPoints / 100) * 100) / 100;
      finalPrice = Math.max(0, Math.round((finalPrice - pointsDiscount) * 100) / 100);
      discountUsd = Math.round((discountUsd + pointsDiscount) * 100) / 100;
    }

    // Balance check for non-wallet orders (GameDrop balance protection)
    if (maintSettings?.systemMode !== "FORCE_OPEN" && data.paymentMethod !== "WALLET") {
      const available = (settings?.currentBalance || 0) - (settings?.reservedBalance || 0);
      if (available < finalPrice) {
        return NextResponse.json(
          { error: "Insufficient system balance to fulfill order. Please try again later." },
          { status: 503 }
        );
      }
    }

    // Wallet payment: deduct from balance
    let walletDeducted = false;
    if (data.paymentMethod === "WALLET" && user && finalPrice > 0) {
      const walletBalance = user.walletBalance || 0;
      if (walletBalance >= finalPrice) {
        walletDeducted = true;
        await prisma.user.update({
          where: { id: user.userId },
          data: { walletBalance: { decrement: finalPrice } },
        });
      }
    }

    // Encrypt sensitive data
    const encryptedEmail = encryptField(data.customerEmail);
    const encryptedPhone = encryptField(data.customerPhone);
    const encryptedIp = encryptField(ipAddress);

    const order = await prisma.order.create({
      data: {
        orderNumber,
        gameId: game.id,
        productId: product.id,
        playerUid: data.playerUid,
        serverId: data.serverId,
        playerNickname: data.playerNickname,
        customerEmail: encryptedEmail,
        customerPhone: encryptedPhone,
        amountUsd: finalPrice,
        amountKhr: calcKhr(finalPrice, exchangeRate),
        currency: data.currency,
        paymentMethod: data.paymentMethod,
        status: walletDeducted ? "PAID" : "PENDING",
        ipAddress: encryptedIp,
        userAgent,
        paymentRefEnc: idempotencyHash,
        promoCodeId,
        discountUsd,
        pointsUsed,
        userId: user?.userId,
      },
    });

    // Reserve balance for non-wallet orders
    if (data.paymentMethod !== "WALLET" && settings?.systemMode !== "FORCE_OPEN") {
      await prisma.settings.update({
        where: { id: 1 },
        data: { reservedBalance: { increment: finalPrice } },
      });
      await prisma.walletReservation.create({
        data: {
          userId: user?.userId || "",
          amount: finalPrice,
          currency: data.currency,
          status: "ACTIVE",
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min
          orderId: order.id,
        },
      });
    }

    // Handle wallet payment - no gateway needed
    if (walletDeducted) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paidAt: new Date(),
          status: "PROCESSING",
          paymentRef: `WALLET-${orderNumber}`,
        },
      });

      if (pointsUsed > 0 && user) {
        await prisma.user.update({
          where: { id: user.userId },
          data: { pointsBalance: { decrement: pointsUsed } },
        });
      }

      if (user) {
        await updateUserTotalSpent(user.userId, finalPrice);
      }

      return NextResponse.json({
        orderNumber: order.orderNumber,
        redirectUrl: `${baseUrl}/order?number=${order.orderNumber}`,
        walletPaid: true,
      });
    }

    // Handle insufficient wallet
    if (data.paymentMethod === "WALLET" && finalPrice > 0 && user && (!user.walletBalance || user.walletBalance < finalPrice)) {
      return NextResponse.json({
        error: "Insufficient wallet balance",
        redirectUrl: `${baseUrl}/checkout/${order.orderNumber}`,
        pendingWalletPayment: true,
      });
    }

    // Initiate payment gateway
    const publicUrl = process.env.PUBLIC_APP_URL || baseUrl;
    const init = await initiatePayment({
      orderNumber: order.orderNumber,
      amountUsd: order.amountUsd,
      amountKhr: order.amountKhr,
      currency: order.currency as PaymentCurrency,
      method: data.paymentMethod,
      returnUrl: `${publicUrl}/order?number=${order.orderNumber}`,
      cancelUrl: `${publicUrl}/games/${game.slug}`,
      callbackUrl: `${publicUrl}/api/payment/webhook/bakong`,
      note: `Ty Khai TopUp · ${game.name} · ${product.name}`,
      customerEmail: data.customerEmail,
      metadata: {
        game_slug: game.slug,
        product_name: product.name,
        player_uid: data.playerUid,
      },
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentRef: init.paymentRef,
        paymentUrl: init.redirectUrl,
        qrString: init.qrString ?? null,
        paymentExpiresAt: init.expiresAt,
      },
    });

    return NextResponse.json({
      orderNumber: order.orderNumber,
      redirectUrl: `${baseUrl}/checkout/${order.orderNumber}`,
    });
  } catch (err) {
    console.error("Order create error:", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
