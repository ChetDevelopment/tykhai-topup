-- Update G2Bulk Offer IDs for Free Fire SG/MY
-- Run this after getting the offer IDs from G2Bulk API

-- First, update the settings table with G2Bulk token (already in .env, but can also store in DB)
-- UPDATE "Settings" SET "g2bulkToken" = '07fffdc4807e96f07736ef0c9f40954bcff0ae96ed84d9cf0f8ba6869231f9b2' WHERE id = 1;

-- Get the Free Fire game ID
-- SELECT id FROM "Game" WHERE slug = 'free-fire';

-- Update Free Fire products with G2Bulk offer IDs
-- Replace the offer_id values with actual G2Bulk offer IDs for SG/MY region

-- Example: Assuming G2Bulk uses similar offer IDs (you need to get these from G2Bulk API)
-- Run: GET https://api.g2bulk.com/v1/offers with your token to get available offers

UPDATE "Product" SET "g2bulkOfferId" = 2003 WHERE name = '100 Diamonds' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "g2bulkOfferId" = 2004 WHERE name = '210 Diamonds' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "g2bulkOfferId" = 2005 WHERE name = '530 Diamonds' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "g2bulkOfferId" = 2006 WHERE name = '1080 Diamonds' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "g2bulkOfferId" = 2007 WHERE name = '2200 Diamonds' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');
UPDATE "Product" SET "g2bulkOfferId" = 2008 WHERE name = '5600 Diamonds' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');

-- Verify the updates
-- SELECT p.name, p."gameDropOfferId", p."g2bulkOfferId" 
-- FROM "Product" p 
-- JOIN "Game" g ON p."gameId" = g.id 
-- WHERE g.slug = 'free-fire';
