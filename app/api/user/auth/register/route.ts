import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createUserSession, setUserSessionCookie } from "@/lib/auth";
import { isRealEmail } from "@/lib/email-validator";

export async function POST(req: Request) {
  try {
    const { email, password, name, referralCode } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const emailValid = await isRealEmail(email);
    if (!emailValid) {
      return NextResponse.json(
        { error: "Please use a real email address (e.g., Gmail, Outlook)" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "User already exists with this email" },
        { status: 400 }
      );
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Find referrer by referral code (last 6 chars of user ID)
    let referredById = null;
    if (referralCode) {
      const potentialReferrers = await prisma.user.findMany({
        where: { id: { endsWith: referralCode.toUpperCase() } },
        select: { id: true }
      });
      if (potentialReferrers.length === 1) {
        referredById = potentialReferrers[0].id;
      }
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        referredById,
      },
    });

    // Create session
    const session = await createUserSession({
      userId: user.id,
      email: user.email,
      name: user.name ?? undefined,
      role: user.role,
      vipRank: user.vipRank,
    });

    // Set cookie
    await setUserSessionCookie(session);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        vipRank: user.vipRank,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
