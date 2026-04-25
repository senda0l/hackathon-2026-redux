import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenderStatus, ZoneStatus } from '@prisma/client';

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
    });
  }

  async createTender(_zoneId: string, _deadline: Date) {
    throw new BadRequestException(
      'Direct tender creation from existing flow is disabled. Choose TENDER at publication time.',
    );
  }

  async submitProposal(
    tenderId: string,
    companyId: string,
    data: {
      description: string;
      constructionType: string;
      estimatedCompletion: Date;
      budget: number;
      documentUrl?: string;
    },
  ) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      include: { zone: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (new Date() > tender.deadline)
      throw new BadRequestException('Tender deadline passed');
    if (tender.status === TenderStatus.AWARDED) {
      throw new BadRequestException('Tender is already awarded');
    }

    return this.prisma.tenderProposal.create({
      data: { tenderId, companyId, ...data },
    });
  }

  async getMyProposals(companyId: string) {
    return this.prisma.tenderProposal.findMany({
      where: { companyId },
      include: {
        score: true,
        tender: {
          select: {
            id: true,
            status: true,
            deadline: true,
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
      orderBy: { submittedAt: 'desc' },
    });
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
        zone: true,
      },
    });
  }

  async scoreProposal(
    proposalId: string,
    scoredById: string,
    scores: { designScore: number; timelineScore: number; socialScore: number },
  ) {
    const total =
      scores.designScore + scores.timelineScore + scores.socialScore;

    const score = await this.prisma.tenderScore.upsert({
      where: { proposalId },
      update: { ...scores, total, scoredById },
      create: { proposalId, scoredById, ...scores, total },
    });

    return score;
  }

  async awardWinner(tenderId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      include: { proposals: { include: { score: true } } },
    });
    if (!tender) throw new NotFoundException('Tender not found');

    const winner = tender.proposals
      .filter((p) => p.score)
      .sort((a, b) => b.score!.total - a.score!.total)[0];

    if (!winner) throw new BadRequestException('No scored proposals found');

    const zoneBefore = await this.prisma.zone.findUnique({
      where: { id: tender.zoneId },
    });
    if (!zoneBefore) throw new NotFoundException('Zone not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.zone.update({
        where: { id: tender.zoneId },
        data: { status: ZoneStatus.AWARDED },
      });

      await tx.tender.update({
        where: { id: tenderId },
        data: { status: TenderStatus.AWARDED },
      });

      await tx.zoneAuditLog.create({
        data: {
          zoneId: tender.zoneId,
          oldStatus: zoneBefore.status,
          newStatus: ZoneStatus.AWARDED,
          source: 'PLATFORM',
          reason: `Tender ${tenderId} winner awarded: ${winner.companyId}`,
        },
      });
    });

    return {
      winnerId: winner.companyId,
      proposalId: winner.id,
      totalScore: winner.score!.total,
    };
  }
}
