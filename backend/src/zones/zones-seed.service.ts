import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ZoneStatus, ZoneType } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';

type GeoJsonGeometry =
  | {
      type: 'Polygon';
      coordinates: number[][][];
    }
  | {
      type: 'MultiPolygon';
      coordinates: number[][][][];
    };

type ImportedZoneProperties = {
  id?: string;
  sourceId?: string;
  type?: string;
  status?: string;
  minPrice?: number;
  description?: string;
  publishedAt?: string | null;
};

type ImportedZoneFeature = {
  type?: string;
  geometry?: GeoJsonGeometry | null;
  properties?: ImportedZoneProperties;
};

type ImportedZoneCollection = {
  type?: string;
  features?: ImportedZoneFeature[];
};

export type ZoneImportResult = {
  created: number;
  updated: number;
  skipped: number;
  total: number;
};

@Injectable()
export class ZonesSeedService {
  private readonly logger = new Logger(ZonesSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async importFromFile(
    filePath = 'tashkent-zones.geojson',
  ): Promise<ZoneImportResult> {
    const resolvedPath = isAbsolute(filePath)
      ? filePath
      : resolve(process.cwd(), filePath);

    let parsed: ImportedZoneCollection;
    try {
      const raw = await readFile(resolvedPath, 'utf8');
      parsed = JSON.parse(raw) as ImportedZoneCollection;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException(
          `Zone import file not found at ${resolvedPath}`,
        );
      }
      throw error;
    }

    const features = Array.isArray(parsed.features) ? parsed.features : [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    await this.prisma.zone.deleteMany({
      where: {
        sourceId: {
          startsWith: 'mock-tashkent-',
        },
      },
    });

    for (const feature of features) {
      const properties = feature.properties;
      const sourceId = properties?.sourceId ?? properties?.id;
      const geometry = feature.geometry;

      if (!sourceId || !this.isValidGeometry(geometry)) {
        skipped += 1;
        continue;
      }

      const existing = await this.prisma.zone.findUnique({
        where: { sourceId },
        select: { id: true },
      });

      const zoneType = this.parseZoneType(properties?.type);
      const zoneStatus = this.parseZoneStatus(properties?.status, zoneType);
      const minPrice = this.parseMinPrice(
        properties?.minPrice,
        zoneType,
        zoneStatus,
      );
      const publishedAt = this.parseDate(properties?.publishedAt);

      await this.prisma.zone.upsert({
        where: { sourceId },
        update: {
          geometry,
          type: zoneType,
          status: zoneStatus,
          minPrice,
          description: properties?.description ?? null,
          publishedAt,
        },
        create: {
          sourceId,
          geometry,
          type: zoneType,
          status: zoneStatus,
          minPrice,
          description: properties?.description ?? null,
          publishedAt,
        },
      });

      if (existing) {
        updated += 1;
      } else {
        created += 1;
      }
    }

    const result = {
      created,
      updated,
      skipped,
      total: features.length,
    };

    this.logger.log(
      `Imported ${result.created + result.updated} zones from ${resolvedPath} (skipped ${result.skipped}/${result.total})`,
    );

    return result;
  }

  private isValidGeometry(
    geometry: ImportedZoneFeature['geometry'],
  ): geometry is GeoJsonGeometry {
    if (!geometry || typeof geometry !== 'object') {
      return false;
    }

    if (geometry.type === 'Polygon') {
      return Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0;
    }

    if (geometry.type === 'MultiPolygon') {
      return Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0;
    }

    return false;
  }

  private parseZoneType(type?: string): ZoneType {
    const normalized = String(type ?? '').toUpperCase();
    if ((Object.values(ZoneType) as string[]).includes(normalized)) {
      return normalized as ZoneType;
    }

    return ZoneType.RESIDENTIAL;
  }

  private parseZoneStatus(status: string | undefined, type: ZoneType): ZoneStatus {
    const normalized = String(status ?? '').toUpperCase();
    if ((Object.values(ZoneStatus) as string[]).includes(normalized)) {
      return normalized as ZoneStatus;
    }

    return type === ZoneType.RESTRICTED
      ? ZoneStatus.RESTRICTED
      : ZoneStatus.AVAILABLE;
  }

  private parseMinPrice(
    minPrice: number | undefined,
    type: ZoneType,
    status: ZoneStatus,
  ): number {
    if (typeof minPrice === 'number' && Number.isFinite(minPrice)) {
      return minPrice;
    }

    if (status === ZoneStatus.RESTRICTED || type === ZoneType.RESTRICTED) {
      return 0;
    }

    switch (type) {
      case ZoneType.INDUSTRIAL:
        return 700000;
      case ZoneType.COMMERCIAL:
        return 950000;
      case ZoneType.PUBLIC_INFRA:
        return 500000;
      case ZoneType.RESIDENTIAL:
      default:
        return 450000;
    }
  }

  private parseDate(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}