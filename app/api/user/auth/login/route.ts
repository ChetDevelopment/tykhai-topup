import { NextResponse } from "next/server";
import { verifyUserCredentials, createUserSession, setUserSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const user = await verifyUserCredentials(email, password);

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Create session
    const session = await createUserSession({
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
      vipRank: user.vipRank,
    });

    // Set cookie
    await setUserSessionCookie(session);

    return NextResponse.json({
      success: true,
      user: {
        id: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        vipRank: user.vipRank,
      },
    });
  } catch (error: any) {
    console.error("Login error:", error);
    // If it's a known error from verifyUserCredentials, we show it
    const message = error instanceof Error ? error.message : "Invalid email or password";
    return NextResponse.json(
      { error: message.includes("Unexpected token") ? "Invalid email or password" : message },
      { status: 401 }
    );
  }
}
