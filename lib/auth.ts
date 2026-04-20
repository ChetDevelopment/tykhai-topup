import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { getServerSession, NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { getRank } from "./vip";

const ADMIN_COOKIE = "tykhai_admin";
const USER_COOKIE = "tykhai_user";
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

function getSecret() {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || (process.env.NODE_ENV === "development" ? "development_secret_key_at_least_32_characters_long" : null);
  
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET or NEXTAUTH_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

// --- NextAuth Options ---
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        session.user.email = token.email as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};

export interface AdminSession {
  adminId: string;
  email: string;
  role: string;
}

export interface UserSession {
  userId: string;
  email: string;
  name?: string;
  role: string;
  vipRank: string;
  pointsBalance?: number;
  walletBalance?: number;
}

// --- Admin Auth ---
export async function createAdminSession(payload: AdminSession): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(getSecret());
}

export async function verifyAdminSession(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.adminId) return null;
    return {
      adminId: payload.adminId as string,
      email: payload.email as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}

export async function getCurrentAdmin(): Promise<AdminSession | null> {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  return await verifyAdminSession(token);
}

export async function verifyAdminCredentials(email: string, password: string) {
  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin || !admin.active) return null;
  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) return null;
  await prisma.admin.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });
  return { adminId: admin.id, email: admin.email, role: admin.role };
}

export async function setAdminSessionCookie(token: string) {
  cookies().set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function clearAdminSessionCookie() {
  cookies().delete(ADMIN_COOKIE);
}

// --- User Auth ---
export async function createUserSession(payload: UserSession): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(getSecret());
}

export async function verifyUserSession(token: string): Promise<UserSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.userId) return null;
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as string,
      vipRank: payload.vipRank as string,
    };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<UserSession | null> {
  let userId: string | null = null;
  let email: string | null = null;

  // 1. Try Manual JWT Cookie
  const manualToken = cookies().get(USER_COOKIE)?.value;
  if (manualToken) {
    const session = await verifyUserSession(manualToken);
    if (session) {
      userId = session.userId;
      email = session.email;
    }
  }

  // 2. Try NextAuth Session (Social)
  if (!email) {
    const nextAuthSession = await getServerSession(authOptions);
    if (nextAuthSession?.user) {
      email = nextAuthSession.user.email!;
      userId = (nextAuthSession.user as any).id;
    }
  }

  if (!email && !userId) return null;

  // 3. Unify both via Database lookup
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { id: userId || undefined },
        { email: email || undefined }
      ]
    },
    select: { id: true, email: true, name: true, role: true, vipRank: true, pointsBalance: true, walletBalance: true, totalSpentUsd: true }
  });

  if (!user) return null;

  return {
    userId: user.id,
    email: user.email,
    name: user.name ?? undefined,
    role: user.role,
    vipRank: user.vipRank,
    pointsBalance: user.pointsBalance,
    walletBalance: user.walletBalance
  };
}

export async function verifyUserCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ 
    where: { email },
    include: { accounts: true }
  });

  if (!user) return null;

  if (!user.passwordHash) {
    if (user.accounts.length > 0) {
      throw new Error("This account uses social login (Google). Please use the social login button.");
    }
    return null;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  return {
    userId: user.id,
    email: user.email,
    name: user.name ?? undefined,
    role: user.role,
    vipRank: user.vipRank,
    pointsBalance: user.pointsBalance,
    walletBalance: user.walletBalance,
  };
}

export async function setUserSessionCookie(token: string) {
  cookies().set(USER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL,
    path: "/",
  });
}

export async function clearUserSessionCookie() {
  cookies().delete(USER_COOKIE);
}

export async function updateUserTotalSpent(userId: string, amountUsd: number) {
  if (!userId || amountUsd <= 0) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { totalSpentUsd: true } });
  if (!user) return;
  const newTotal = user.totalSpentUsd + amountUsd;
  const newRank = getRank(newTotal);
  await prisma.user.update({
    where: { id: userId },
    data: { 
      totalSpentUsd: { increment: amountUsd },
      vipRank: newRank
    }
  });
}

export async function requireAdmin(): Promise<AdminSession> {
  const admin = await getCurrentAdmin();
  if (!admin) throw new Error("UNAUTHORIZED");
  return admin;
}

export { ADMIN_COOKIE, USER_COOKIE };
