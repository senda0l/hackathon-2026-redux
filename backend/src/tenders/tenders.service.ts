import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TenderStatus, ZoneStatus } from '@prisma/client'

@Injectable()
export class TendersService {
  constructor(private prisma: PrismaService) {}

  async listTenders() {
    return this.prisma.tender.findMany({
      include: {
        zone: {
          select: {
            id: true,
            type: true,
            status: true,
            minPrice: true,
          },
        },
        proposals: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async createTender(_auctionId: string, _deadline: Date) {
    throw new BadRequestException(
      'Auction-to-tender transition is disabled. Choose TENDER at publication time instead.',
    )
  }

  async submitProposal(
    tenderId: string,
    companyId: string,
    data: {
      description: string
      constructionType: string
      estimatedCompletion: Date
      budget: number
      documentUrl?: string
    },
  ) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      include: { auction: { include: { finalists: true } } },
    })
    if (!tender) throw new NotFoundException('Tender not found')
    if (new Date() > tender.deadline) throw new BadRequestException('Tender deadline passed')
    if (!tender.auction) throw new BadRequestException('Tender is not linked to an auction')

    const isFinalist = tender.auction.finalists.some((f) => f.companyId === companyId)
    if (!isFinalist) throw new ForbiddenException('Only auction finalists can submit proposals')

    return this.prisma.tenderProposal.create({
      data: { tenderId, companyId, ...data },
    })
  }

  async getTender(id: string) {
    return this.prisma.tender.findUnique({
      where: { id },
      include: {
        proposals: {
          include: {
            company: { select: { id: true, companyName: true } },
            score: true,
          },
        },
        auction: { include: { zone: true } },
      },
    })
  }

  async scoreProposal(
    proposalId: string,
    scoredById: string,
    scores: { designScore: number; timelineScore: number; socialScore: number },
  ) {
    const total = scores.designScore + scores.timelineScore + scores.socialScore

    const score = await this.prisma.tenderScore.upsert({
      where: { proposalId },
      update: { ...scores, total, scoredById },
      create: { proposalId, scoredById, ...scores, total },
    })

    return score
  }

  async awardWinner(tenderId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      include: { proposals: { include: { score: true } }, auction: true },
    })
    if (!tender) throw new NotFoundException('Tender not found')
    if (!tender.auction) throw new BadRequestException('Tender is not linked to an auction')

    const winner = tender.proposals
      .filter((p) => p.score)
      .sort((a, b) => (b.score!.total - a.score!.total))[0]

    if (!winner) throw new BadRequestException('No scored proposals found')

    const zoneBefore = await this.prisma.zone.findUnique({ where: { id: tender.auction.zoneId } })
    if (!zoneBefore) throw new NotFoundException('Zone not found')

    await this.prisma.$transaction(async (tx) => {
      await tx.zone.update({
        where: { id: tender.auction!.zoneId },
        data: { status: ZoneStatus.AWARDED },
      })

      await tx.tender.update({
        where: { id: tenderId },
        data: { status: TenderStatus.AWARDED },
      })

      await tx.zoneAuditLog.create({
        data: {
          zoneId: tender.auction!.zoneId,
          oldStatus: zoneBefore.status,
          newStatus: ZoneStatus.AWARDED,
          source: 'PLATFORM',
          reason: `Tender ${tenderId} winner awarded: ${winner.companyId}`,
        },
      })
    })

    return { winnerId: winner.companyId, proposalId: winner.id, totalScore: winner.score!.total }
  }
}
