import type { Metadata } from "next";
import "./globals.css";
import { prisma } from "@/lib/prisma";
import { CurrencyProvider } from "@/lib/currency";
import RouteProgress from "@/components/RouteProgress";
import AnnouncementBar from "@/components/AnnouncementBar";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Providers from "@/components/Providers";
import LiveRefresher from "@/components/LiveRefresher";
import SupportBubble from "@/components/SupportBubble";
import LiveDeliveryFeed from "@/components/LiveDeliveryFeed";

export const metadata: Metadata = {
  title: "Ty Khai TopUp — Fast & Secure Game Top Up",
  description:
    "Top up Mobile Legends, Free Fire, PUBG, Genshin Impact and more. Instant delivery, secure KHQR payment. 24/7 service in Cambodia.",
  keywords: [
    "top up",
    "mobile legends diamonds",
    "free fire diamonds",
    "pubg uc",
    "genshin impact",
    "ABA Pay",
    "KHQR",
    "Cambodia top up",
  ],
  openGraph: {
    title: "Ty Khai TopUp — Fast & Secure Game Top Up",
    description: "Instant game top-ups with KHQR · ABA Pay · Wing · ACLEDA",
    type: "website",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ty Khai TopUp",
  },
};

export const viewport = {
  themeColor: "#6366f1",
};

import SecurityWrapper from "@/components/SecurityWrapper";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } }).catch(() => null);
  const exchangeRate = settings?.exchangeRate ?? 4100;
  const session = await getServerSession(authOptions);

  return (
    <html lang="en">
      <body>
        <Providers session={session}>
          <SecurityWrapper>
            <RouteProgress />
            <CurrencyProvider exchangeRate={exchangeRate}>
              <AnnouncementBar />
              {children}
              <LiveDeliveryFeed />
              <SupportBubble />
            </CurrencyProvider>
          </SecurityWrapper>
        </Providers>
      </body>
    </html>
  );
}
