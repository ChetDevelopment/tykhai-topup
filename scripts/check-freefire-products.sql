-- Check Free Fire products with G2Bulk catalogue names
SELECT 
  name as "Product Name",
  amount as "Diamonds",
  "priceUsd" as "Price USD",
  "g2bulkCatalogueName" as "G2Bulk Catalogue"
FROM "Product" 
WHERE "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire')
ORDER BY 
  CASE 
    WHEN amount >0 THEN 0 
    ELSE 1 
  END,
  amount ASC;
