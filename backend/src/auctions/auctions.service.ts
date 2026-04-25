import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionStatus, PublicationType, ZoneStatus } from '@prisma/client';

@Injectable()
export class AuctionsService {
  constructor(private prisma: PrismaService) {}

  async create(
    zoneId: string,
    startDate: Date,
    endDate: Date,
    minBid: number,
    maxFinalists: number,
  ) {
    const zone = await this.prisma.zone.findUnique({ where: { id: zoneId } });
    if (!zone) throw new NotFoundException('Zone not found');
    if (zone.status !== ZoneStatus.AVAILABLE)
      throw new BadRequestException('Zone is not available');

    const auction = await this.prisma.$transaction(async (tx) => {
      const created = await tx.auction.create({
        data: { zoneId, startDate, endDate, minBid, maxFinalists },
      });

      await tx.zone.update({
        where: { id: zoneId },
        data: {
          status: ZoneStatus.IN_AUCTION,
          publicationType: PublicationType.AUCTION,
          publishedAt: new Date(),
        },
      });

      await tx.zoneAuditLog.create({
        data: {
          zoneId,
          oldStatus: zone.status,
          newStatus: ZoneStatus.IN_AUCTION,
          source: 'PLATFORM',
          reason: 'Auction published directly by GOV_ADMIN',
        },
      });

      return created;
    });

    return auction;
  }

  async getAll() {
    await this.autoCloseExpiredAuctions();
    return this.prisma.auction.findMany({
      include: {
        zone: true,
        bids: {
          orderBy: { amount: 'desc' },
          include: { company: { select: { id: true, companyName: true } } },
        },
        finalists: true,
      },
    });
  }

  async getById(id: string) {
    await this.autoCloseExpiredAuctions();
    return this.prisma.auction.findUnique({
      where: { id },
      include: {
        zone: true,
        bids: {
          orderBy: { amount: 'desc' },
          include: { company: { select: { id: true, companyName: true } } },
        },
        finalists: true,
      },
    });
  }

  async getMyBids(companyId: string) {
    await this.autoCloseExpiredAuctions();
    return this.prisma.bid.findMany({
      where: { companyId },
      include: {
        auction: {
          select: {
            id: true,
            status: true,
            endDate: true,
            minBid: true,
            zone: {
              select: {
                id: true,
                type: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: { placedAt: 'desc' },
    });
  }

  async placeBid(auctionId: string, companyId: string, amount: number) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
    });
    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.status !== AuctionStatus.OPEN)
      throw new BadRequestException('Auction is not open');
    if (new Date() > auction.endDate) {
      await this.closeAuctionByHighestBid(
        auctionId,
        'Auto-closed after end date',
      );
      throw new BadRequestException('Auction has ended and was auto-closed');
    }
    if (amount < auction.minBid)
      throw new BadRequestException(`Minimum bid is ${auction.minBid}`);

    // Prevent bid lower than current highest
    const highest = await this.prisma.bid.findFirst({
      where: { auctionId },
      orderBy: { amount: 'desc' },
    });
    if (highest && amount <= highest.amount) {
      throw new BadRequestException(
        `Bid must exceed current highest: ${highest.amount}`,
      );
    }

    return this.prisma.bid.create({
      data: { auctionId, companyId, amount },
    });
  }

  // Gov admin closes auction and finalizes winner (auction-only path).
  async selectFinalists(auctionId: string) {
    await this.autoCloseExpiredAuctions();
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: { bids: { orderBy: { amount: 'desc' } }, zone: true },
    });
    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.status !== AuctionStatus.OPEN) {
      throw new BadRequestException('Auction is already closed');
    }
    if (auction.zone.status !== ZoneStatus.IN_AUCTION) {
      throw new BadRequestException('Zone is not currently in auction');
    }
    if (auction.zone.publicationType !== PublicationType.AUCTION) {
      throw new BadRequestException(
        'This zone is not configured for auction finalization',
      );
    }
    return this.closeAuctionByHighestBid(
      auctionId,
      'Closed manually by GOV_ADMIN',
    );
  }

  private async autoCloseExpiredAuctions() {
    const now = new Date();
    const expired = await this.prisma.auction.findMany({
      where: { status: AuctionStatus.OPEN, endDate: { lt: now } },
      select: { id: true },
    });
    for (const a of expired) {
      await this.closeAuctionByHighestBid(
        a.id,
        'Auto-closed after auction end date',
      );
    }
  }

  private async closeAuctionByHighestBid(auctionId: string, reason: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: { bids: { orderBy: { amount: 'desc' } }, zone: true },
    });
    if (!auction) throw new NotFoundException('Auction not found');
    if (auction.status !== AuctionStatus.OPEN) {
      return {
        finalists: 0,
        winnerCompanyId: null,
        message: 'Auction already closed.',
      };
    }
    if (auction.bids.length === 0) {
      throw new BadRequestException('Cannot close auction without bids');
    }

    // Deduplicate by company, keeping each company's highest bid.
    const seen = new Set<string>();
    const topBids = auction.bids
      .filter((b) => {
        if (seen.has(b.companyId)) return false;
        seen.add(b.companyId);
        return true;
      })
      .slice(0, auction.maxFinalists);

    await this.prisma.$transaction(async (tx) => {
      await tx.auctionFinalist.deleteMany({ where: { auctionId } });
      await tx.auctionFinalist.createMany({
        data: topBids.map((b) => ({
          auctionId,
          companyId: b.companyId,
          bidAmount: b.amount,
        })),
      });

      await tx.auction.update({
        where: { id: auctionId },
        data: { status: AuctionStatus.CLOSED },
      });

      await tx.zone.update({
        where: { id: auction.zoneId },
        data: { status: ZoneStatus.AWARDED },
      });

      await tx.zoneAuditLog.create({
        data: {
          zoneId: auction.zoneId,
          oldStatus: auction.zone.status,
          newStatus: ZoneStatus.AWARDED,
          source: 'PLATFORM',
          reason: `${reason}. Winner: ${topBids[0]?.companyId}`,
        },
      });
    });

    return {
      finalists: topBids.length,
      winnerCompanyId: topBids[0]?.companyId,
      message: 'Auction closed and winner awarded.',
    };
  }
}
