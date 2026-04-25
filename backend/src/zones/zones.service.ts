import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ConfigService } from '@nestjs/config'
import {
  PublicationType,
  RequestStatus,
  TenderStatus,
  ZoneType,
  ZoneStatus,
} from '@prisma/client'

@Injectable()
export class ZonesService {
  private readonly logger = new Logger(ZonesService.name)

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // Call this on a cron or manually to sync from gov API
  async syncFromGovApi() {
    const url = this.config.get<string>('GOV_API_URL')
    if (!url) {
      this.logger.warn('GOV_API_URL is not configured; skipping sync')
      return
    }

    try {
      const res = await fetch(url)
      const geojson = await res.json()

      for (const feature of geojson.features) {
        const { sourceId, type, minPrice, description } = feature.properties

        await this.prisma.zone.upsert({
          where: { sourceId: String(sourceId) },
          update: {
            geometry: feature.geometry,
            type: type as ZoneType,
            minPrice,
            description,
          },
          create: {
            sourceId: String(sourceId),
            geometry: feature.geometry,
            type: type as ZoneType,
            minPrice,
            description,
            status: type === 'RESTRICTED' ? ZoneStatus.RESTRICTED : ZoneStatus.AVAILABLE,
          },
        })
      }

      this.logger.log(`Synced ${geojson.features.length} zones from gov API`)
    } catch (err) {
      this.logger.error('Failed to sync gov API', err)
    }
  }

  // All zones as GeoJSON FeatureCollection (public)
  async getAllAsGeoJson() {
    const shouldSeedMock =
      this.config.get<string>('ENABLE_MOCK_ZONES') !== 'false' &&
      this.config.get<string>('NODE_ENV') !== 'production'
    if (shouldSeedMock) {
      await this.ensureMockZonesIfEmpty()
    }

    const zones = await this.prisma.zone.findMany()

    return {
      type: 'FeatureCollection',
      features: zones.map((z) => ({
        type: 'Feature',
        id: z.id,
        geometry: z.geometry,
        properties: {
          id: z.id,
          type: z.type,
          status: z.status,
          minPrice: z.minPrice,
          description: z.description,
          publishedAt: z.publishedAt,
        },
      })),
    }
  }

  private async ensureMockZonesIfEmpty() {
    const count = await this.prisma.zone.count()
    if (count > 0) return

    const mocks = this.buildMockTashkentZones()
    await this.prisma.zone.createMany({
      data: mocks.map((z) => ({
        sourceId: z.sourceId,
        geometry: z.geometry,
        type: z.type,
        status: z.status,
        minPrice: z.minPrice,
        description: z.description,
      })),
    })
    this.logger.log(`Seeded ${mocks.length} mock Tashkent zones`)
  }

  private buildMockTashkentZones() {
    // Coarse grid around Tashkent center for local development.
    const centerLat = 41.2995
    const centerLng = 69.2401
    const latStep = 0.02
    const lngStep = 0.03

    const rows = 6
    const cols = 6
    const startLat = centerLat - (rows / 2) * latStep
    const startLng = centerLng - (cols / 2) * lngStep

    const availableTypes: ZoneType[] = [
      ZoneType.RESIDENTIAL,
      ZoneType.INDUSTRIAL,
      ZoneType.COMMERCIAL,
      ZoneType.PUBLIC_INFRA,
    ]

    const zones: Array<{
      sourceId: string
      geometry: any
      type: ZoneType
      status: ZoneStatus
      minPrice: number
      description: string
    }> = []

    let idx = 1
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const west = startLng + c * lngStep
        const south = startLat + r * latStep
        const east = west + lngStep * 0.92
        const north = south + latStep * 0.92

        const isRestricted = (r + c) % 7 === 0
        const type = isRestricted
          ? ZoneType.RESTRICTED
          : availableTypes[(r + c) % availableTypes.length]

        zones.push({
          sourceId: `mock-tashkent-${idx}`,
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [west, south],
                [east, south],
                [east, north],
                [west, north],
                [west, south],
              ],
            ],
          },
          type,
          status: isRestricted ? ZoneStatus.RESTRICTED : ZoneStatus.AVAILABLE,
          minPrice: 100000 + idx * 7500,
          description: isRestricted
            ? 'Mock protected area for local testing'
            : `Mock ${type.toLowerCase()} development zone in Tashkent`,
        })
        idx++
      }
    }

    return zones
  }

  async getById(id: string) {
    return this.prisma.zone.findUnique({
      where: { id },
      include: { auctions: { include: { bids: true, tender: true } } },
    })
  }

  async getAvailableZonesForPublishing() {
    return this.prisma.zone.findMany({
      where: { status: ZoneStatus.AVAILABLE },
      select: {
        id: true,
        type: true,
        status: true,
        minPrice: true,
        description: true,
        sourceId: true,
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getAuditLog(zoneId: string) {
    return this.prisma.zoneAuditLog.findMany({
      where: { zoneId },
      include: {
        changedBy: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { changedAt: 'desc' },
    })
  }

  async submitParcelRequest(zoneId: string, companyId: string, geometry: any) {
    return this.prisma.parcelRequest.create({
      data: {
        zoneId,
        companyId,
        geometry,
      },
    })
  }

  async getMyRequests(companyId: string) {
    return this.prisma.parcelRequest.findMany({
      where: { companyId },
      include: {
        zone: {
          select: {
            id: true,
            type: true,
            status: true,
            minPrice: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getPendingRequests() {
    return this.prisma.parcelRequest.findMany({
      where: { status: RequestStatus.PENDING },
      include: {
        company: {
          select: {
            id: true,
            email: true,
            companyName: true,
          },
        },
        zone: {
          select: {
            id: true,
            type: true,
            status: true,
            minPrice: true,
            publicationType: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
  }

  async reviewRequest(
    requestId: string,
    reviewerId: string,
    body: {
      action: 'APPROVE' | 'REJECT'
      note?: string
      publicationType?: PublicationType
      auction?: {
        startDate: Date
        endDate: Date
        minBid: number
        maxFinalists?: number
      }
      tender?: {
        deadline: Date
      }
    },
  ) {
    const request = await this.prisma.parcelRequest.findUnique({
      where: { id: requestId },
      include: { zone: true },
    })

    if (!request) {
      throw new NotFoundException('Request not found')
    }

    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException('Request already reviewed')
    }

    if (body.action === 'REJECT') {
      return this.prisma.parcelRequest.update({
        where: { id: requestId },
        data: {
          status: RequestStatus.REJECTED,
          note: body.note,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
        },
      })
    }

    if (!body.publicationType) {
      throw new BadRequestException('publicationType is required for approval')
    }

    const oldStatus = request.zone.status
    let newStatus: ZoneStatus = oldStatus

    await this.prisma.$transaction(async (tx) => {
      if (body.publicationType === PublicationType.AUCTION) {
        if (!body.auction) throw new BadRequestException('auction settings are required')

        await tx.auction.create({
          data: {
            zoneId: request.zoneId,
            startDate: body.auction.startDate,
            endDate: body.auction.endDate,
            minBid: body.auction.minBid,
            maxFinalists: body.auction.maxFinalists ?? 6,
          },
        })
        newStatus = ZoneStatus.IN_AUCTION
      } else {
        if (!body.tender) throw new BadRequestException('tender settings are required')

        await tx.tender.create({
          data: {
            zoneId: request.zoneId,
            deadline: body.tender.deadline,
            status: TenderStatus.OPEN,
          },
        })
        newStatus = ZoneStatus.IN_TENDER
      }

      await tx.zone.update({
        where: { id: request.zoneId },
        data: {
          status: newStatus,
          publicationType: body.publicationType,
          publishedAt: new Date(),
        },
      })

      await tx.parcelRequest.update({
        where: { id: requestId },
        data: {
          status: RequestStatus.APPROVED,
          note: body.note,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
        },
      })

      await tx.zoneAuditLog.create({
        data: {
          zoneId: request.zoneId,
          oldStatus,
          newStatus,
          changedById: reviewerId,
          source: 'PLATFORM',
          reason: body.note ?? `Approved request ${requestId} with ${body.publicationType}`,
        },
      })
    })

    return { ok: true }
  }

  async publishZoneDirect(
    zoneId: string,
    publisherId: string,
    body: {
      publicationType: PublicationType
      note?: string
      auction?: {
        startDate: Date
        endDate: Date
        minBid: number
        maxFinalists?: number
      }
      tender?: {
        deadline: Date
      }
    },
  ) {
    const zone = await this.prisma.zone.findUnique({ where: { id: zoneId } })
    if (!zone) throw new NotFoundException('Zone not found')
    if (zone.status !== ZoneStatus.AVAILABLE) {
      throw new BadRequestException('Only AVAILABLE zones can be published directly')
    }

    let newStatus: ZoneStatus = zone.status

    await this.prisma.$transaction(async (tx) => {
      if (body.publicationType === PublicationType.AUCTION) {
        if (!body.auction) throw new BadRequestException('auction settings are required')

        await tx.auction.create({
          data: {
            zoneId,
            startDate: body.auction.startDate,
            endDate: body.auction.endDate,
            minBid: body.auction.minBid,
            maxFinalists: body.auction.maxFinalists ?? 6,
          },
        })
        newStatus = ZoneStatus.IN_AUCTION
      } else {
        if (!body.tender) throw new BadRequestException('tender settings are required')

        await tx.tender.create({
          data: {
            zoneId,
            deadline: body.tender.deadline,
            status: TenderStatus.OPEN,
          },
        })
        newStatus = ZoneStatus.IN_TENDER
      }

      await tx.zone.update({
        where: { id: zoneId },
        data: {
          status: newStatus,
          publicationType: body.publicationType,
          publishedAt: new Date(),
        },
      })

      await tx.zoneAuditLog.create({
        data: {
          zoneId,
          oldStatus: zone.status,
          newStatus,
          changedById: publisherId,
          source: 'PLATFORM',
          reason: body.note ?? `Direct publish with ${body.publicationType}`,
        },
      })
    })

    return { ok: true }
  }
}
