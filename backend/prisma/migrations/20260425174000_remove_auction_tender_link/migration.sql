ALTER TABLE "Tender"
DROP CONSTRAINT IF EXISTS "Tender_auctionId_fkey";

DROP INDEX IF EXISTS "Tender_auctionId_key";

ALTER TABLE "Tender"
DROP COLUMN IF EXISTS "auctionId";
