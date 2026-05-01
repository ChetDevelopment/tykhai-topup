-- Update G2Bulk Catalogue Names for Free Fire SGMY
-- Run this after getting the catalogue from G2Bulk API

-- Get the Free Fire game ID
-- SELECT id FROM "Game" WHERE slug = 'free-fire';

-- Update Free Fire products with G2Bulk catalogue names for SGMY region
-- Based on the API response: {"id":2455,"name":"100","amount":0.836}

UPDATE "Product" SET "g2bulkCatalogueName" = '100' WHERE name = '100 Diamonds' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "g2bulkCatalogueName" = '310' WHERE name = '210 Diamonds' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "g2bulkCatalogueName" = '520' WHERE name = '530 Diamonds' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "g2bulkCatalogueName" = '1060' WHERE name = '1080 Diamonds' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "g2bulkCatalogueName" = '2180' WHERE name = '2200 Diamonds' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "g2bulkCatalogueName" = '5600' WHERE name = '5600 Diamonds' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');

-- Verify the updates
-- SELECT p.name, p."gameDropOfferId", p."g2bulkCatalogueName" 
-- FROM "Product" p 
-- JOIN "Game" g ON p."gameId" = g.id 
-- WHERE g.slug = 'free-fire';
