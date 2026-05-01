-- Map Free Fire products to G2Bulk SGMY catalogue names
-- Run this in your database

-- First, let's see what products exist for Free Fire
-- SELECT p.id, p.name, p.amount, p."g2bulkCatalogueName" 
-- FROM "Product" p 
-- JOIN "Game" g ON p."gameId" = g.id 
-- WHERE g.slug = 'free-fire';

-- Map the standard diamond products
UPDATE "Product" SET "g2bulkCatalogueName" = '100' WHERE name = '100 Diamonds' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "g2bulkCatalogueName" = '310' WHERE name = '210 Diamonds' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "g2bulkCatalogueName" = '520' WHERE name = '530 Diamonds' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "g2bulkCatalogueName" = '1060' WHERE name = '1080 Diamonds' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "g2bulkCatalogueName" = '2180' WHERE name = '2200 Diamonds' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "g2bulkCatalogueName" = '5600' WHERE name = '5600 Diamonds' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');

-- Map membership products (if available in G2Bulk)
UPDATE "Product" SET "g2bulkCatalogueName" = 'Weekly' WHERE name = 'Weekly Membership' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "g2bulkCatalogueName" = 'Monthly' WHERE name = 'Monthly Membership' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');

-- Verify the mapping
-- SELECT 
--   p.name as "Product Name",
--   p.amount as "Diamonds",
--   p."g2bulkCatalogueName" as "G2Bulk Catalogue",
--   p."gameDropOfferId" as "GameDrop ID"
-- FROM "Product" p 
-- JOIN "Game" g ON p."gameId" = g.id 
-- WHERE g.slug = 'free-fire'
-- ORDER BY p.amount;
