-- CreateEnum
CREATE TYPE "Role" AS ENUM ('GOV_ADMIN', 'COMPANY', 'PUBLIC');

-- CreateEnum
CREATE TYPE "ZoneType" AS ENUM ('RESIDENTIAL', 'INDUSTRIAL', 'COMMERCIAL', 'PUBLIC_INFRA', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "ZoneStatus" AS ENUM ('AVAILABLE', 'IN_AUCTION', 'IN_TENDER', 'AWARDED', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "PublicationType" AS ENUM ('AUCTION', 'TENDER');

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('OPEN', 'SELECTING_FINALISTS', 'CLOSED');

-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('OPEN', 'SCORING', 'AWARDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PUBLIC',
    "companyName" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "geometry" JSONB NOT NULL,
    "type" "ZoneType" NOT NULL,
    "status" "ZoneStatus" NOT NULL DEFAULT 'AVAILABLE',
    "publicationType" "PublicationType",
    "minPrice" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoneAuditLog" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "oldStatus" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "changedById" TEXT,
    "source" TEXT NOT NULL DEFAULT 'PLATFORM',
    "reason" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZoneAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "minBid" DOUBLE PRECISION NOT NULL,
    "maxFinalists" INTEGER NOT NULL DEFAULT 6,
    "status" "AuctionStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionFinalist" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bidAmount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AuctionFinalist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tender" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT,
    "zoneId" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" "TenderStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderProposal" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "constructionType" TEXT NOT NULL,
    "estimatedCompletion" TIMESTAMP(3) NOT NULL,
    "budget" DOUBLE PRECISION NOT NULL,
    "documentUrl" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderScore" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "scoredById" TEXT NOT NULL,
    "designScore" INTEGER NOT NULL,
    "timelineScore" INTEGER NOT NULL,
    "socialScore" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_sourceId_key" ON "Zone"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Bid_auctionId_companyId_key" ON "Bid"("auctionId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Tender_auctionId_key" ON "Tender"("auctionId");

-- CreateIndex
CREATE UNIQUE INDEX "TenderProposal_tenderId_companyId_key" ON "TenderProposal"("tenderId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "TenderScore_proposalId_key" ON "TenderScore"("proposalId");

-- AddForeignKey
ALTER TABLE "ZoneAuditLog" ADD CONSTRAINT "ZoneAuditLog_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoneAuditLog" ADD CONSTRAINT "ZoneAuditLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionFinalist" ADD CONSTRAINT "AuctionFinalist_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderProposal" ADD CONSTRAINT "TenderProposal_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderProposal" ADD CONSTRAINT "TenderProposal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderScore" ADD CONSTRAINT "TenderScore_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TenderProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderScore" ADD CONSTRAINT "TenderScore_scoredById_fkey" FOREIGN KEY ("scoredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
