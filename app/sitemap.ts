import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  
  const [games, pages] = await Promise.all([
    prisma.game.findMany({
      where: { active: true },
      select: { slug: true, updatedAt: true }
    }),
    prisma.blogPost.findMany({
      where: { published: true },
      select: { slug: true, publishedAt: true, updatedAt: true }
    }),
  ]);

  const staticPages = [
    { url: "", lastmod: new Date() },
    { url: "/login", lastmod: new Date() },
    { url: "/register", lastmod: new Date() },
    { url: "/order", lastmod: new Date() },
    { url: "/account", lastmod: new Date() },
    { url: "/support", lastmod: new Date() },
    { url: "/faq", lastmod: new Date() },
    { url: "/terms", lastmod: new Date() },
    { url: "/privacy", lastmod: new Date() },
    { url: "/refund-policy", lastmod: new Date() },
    { url: "/blog", lastmod: new Date() },
    { url: "/reseller", lastmod: new Date() },
  ];

  const gamePages = games.map(game => ({
    url: `/games/${game.slug}`,
    lastmod: game.updatedAt,
  }));

  const blogPages = pages.map(page => ({
    url: `/blog/${page.slug}`,
    lastmod: page.publishedAt || page.updatedAt,
  }));

  const allUrls = [...staticPages, ...gamePages, ...blogPages];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(p => `  <url>
    <loc>${baseUrl}${p.url}</loc>
    <lastmod>${p.lastmod.toISOString()}</lastmod>
    <changefreq>${p.url === "" ? "daily" : "weekly"}</changefreq>
    <priority>${p.url === "" ? 1.0 : 0.8}</priority>
  </url>`).join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "s-maxage=3600, stale-while-revalidate",
    },
  });
}