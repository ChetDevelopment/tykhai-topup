-- SQL to update Product gameDropOfferId
-- REPLACE the IDs below with actual ones from GameDrop portal!

-- Mobile Legends
UPDATE "Product" SET "gameDropOfferId" = 1003 WHERE "name" = '11 Diamonds' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'mobile-legends');
UPDATE "Product" SET "gameDropOfferId" = 1004 WHERE "name" = '22 Diamonds' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'mobile-legends');
UPDATE "Product" SET "gameDropOfferId" = 1005 WHERE "name" = '56 Diamonds' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'mobile-legends');
UPDATE "Product" SET "gameDropOfferId" = 1006 WHERE "name" = '86 Diamonds' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'mobile-legends');
UPDATE "Product" SET "gameDropOfferId" = 1007 WHERE "name" = '172 Diamonds' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'mobile-legends');

-- Free Fire
UPDATE "Product" SET "gameDropOfferId" = 2003 WHERE "name" = '100 Diamonds' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "gameDropOfferId" = 2004 WHERE "name" = '210 Diamonds' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "gameDropOfferId" = 2005 WHERE "name" = '530 Diamonds' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "gameDropOfferId" = 2006 WHERE "name" = '1080 Diamonds' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "gameDropOfferId" = 2007 WHERE "name" = '2200 Diamonds' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "gameDropOfferId" = 2008 WHERE "name" = '5600 Diamonds' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'free-fire');

-- Genshin Impact
UPDATE "Product" SET "gameDropOfferId" = 3002 WHERE "name" = '60 Genesis Crystals' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'genshin-impact');
UPDATE "Product" SET "gameDropOfferId" = 3003 WHERE "name" = '300 + 30 Genesis Crystals' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'genshin-impact');
UPDATE "Product" SET "gameDropOfferId" = 3004 WHERE "name" = '980 + 110 Genesis Crystals' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'genshin-impact');
UPDATE "Product" SET "gameDropOfferId" = 3005 WHERE "name" = '1980 + 260 Genesis Crystals' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'genshin-impact');
UPDATE "Product" SET "gameDropOfferId" = 3006 WHERE "name" = '3280 + 600 Genesis Crystals' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'genshin-impact');
UPDATE "Product" SET "gameDropOfferId" = 3007 WHERE "name" = '6480 + 1600 Genesis Crystals' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'genshin-impact');

-- Honkai Star Rail
UPDATE "Product" SET "gameDropOfferId" = 4002 WHERE "name" = '60 Oneiric Shards' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'honkai-star-rail');
UPDATE "Product" SET "gameDropOfferId" = 4003 WHERE "name" = '300 + 30 Oneiric Shards' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'honkai-star-rail');
UPDATE "Product" SET "gameDropOfferId" = 4004 WHERE "name" = '980 + 110 Oneiric Shards' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'honkai-star-rail');
UPDATE "Product" SET "gameDropOfferId" = 4005 WHERE "name" = '1980 + 260 Oneiric Shards' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'honkai-star-rail');

-- Call of Duty Mobile
UPDATE "Product" SET "gameDropOfferId" = 5002 WHERE "name" = '80 CP' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'call-of-duty-mobile');
UPDATE "Product" SET "gameDropOfferId" = 5003 WHERE "name" = '400 + 40 CP' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'call-of-duty-mobile');
UPDATE "Product" SET "gameDropOfferId" = 5004 WHERE "name" = '800 + 160 CP' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'call-of-duty-mobile');
UPDATE "Product" SET "gameDropOfferId" = 5005 WHERE "name" = '2000 + 600 CP' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'call-of-duty-mobile');

-- Memberships (if they have separate offer IDs)
UPDATE "Product" SET "gameDropOfferId" = 1002 WHERE "name" = 'Twilight Pass' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'mobile-legends');
UPDATE "Product" SET "gameDropOfferId" = 1008 WHERE "name" = 'Weekly Diamond Pass' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'mobile-legends');
UPDATE "Product" SET "gameDropOfferId" = 2001 WHERE "name" = 'Weekly Membership' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "gameDropOfferId" = 2002 WHERE "name" = 'Monthly Membership' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "gameDropOfferId" = 3001 WHERE "name" = 'Blessing of the Welkin Moon' AND "gameId" IN (SELECT id FROM "Game" WHERE slug = 'genshin-impact');

-- Verify the updates
SELECT p."name", g.slug, p."gameDropOfferId" 
FROM "Product" p 
JOIN "Game" g ON p."gameId" = g.id 
WHERE p."gameDropOfferId" IS NOT NULL 
ORDER BY g.slug, p.amount;
