import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ZonesService } from './zones.service';
import { Roles } from '../auth/roles.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PublicationType, ZoneType } from '@prisma/client';

@Controller('zones')
export class ZonesController {
  constructor(private zones: ZonesService) {}

  @Get('publishable')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('GOV_ADMIN')
  getPublishableZones() {
    return this.zones.getAvailableZonesForPublishing();
  }

  // Public: get all zones as GeoJSON
  @Get()
  getAll() {
    return this.zones.getAllAsGeoJson();
  }

  // Public: get zone detail
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.zones.getById(id);
  }

  @Get(':id/audit')
  getAudit(@Param('id') id: string) {
    return this.zones.getAuditLog(id);
  }

  @Post(':id/requests')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('COMPANY')
  submitRequest(
    @Param('id') id: string,
    @Body() body: { geometry: any; requestedType?: ZoneType },
    @Request() req,
  ) {
    return this.zones.submitParcelRequest(
      id,
      req.user.id,
      body.geometry,
      body.requestedType,
    );
  }

  @Get('requests/mine')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('COMPANY')
  myRequests(@Request() req) {
    return this.zones.getMyRequests(req.user.id);
  }

  @Get('requests/pending')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('GOV_ADMIN')
  pendingRequests() {
    return this.zones.getPendingRequests();
  }

  @Post('requests/:id/review')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('GOV_ADMIN')
  reviewRequest(
    @Param('id') id: string,
    @Request() req,
    @Body()
    body: {
      action: 'APPROVE' | 'REJECT';
      note?: string;
      publicationType?: PublicationType;
      auction?: {
        startDate: string;
        endDate: string;
        minBid: number;
        maxFinalists?: number;
      };
      tender?: {
        deadline: string;
      };
    },
  ) {
    return this.zones.reviewRequest(id, req.user.id, {
      ...body,
      auction: body.auction
        ? {
            ...body.auction,
            startDate: new Date(body.auction.startDate),
            endDate: new Date(body.auction.endDate),
          }
        : undefined,
      tender: body.tender
        ? { deadline: new Date(body.tender.deadline) }
        : undefined,
    });
  }

  @Post(':id/publish')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('GOV_ADMIN')
  publishZoneDirect(
    @Param('id') id: string,
    @Request() req,
    @Body()
    body: {
      publicationType: PublicationType;
      note?: string;
      auction?: {
        startDate: string;
        endDate: string;
        minBid: number;
        maxFinalists?: number;
      };
      tender?: {
        deadline: string;
      };
    },
  ) {
    return this.zones.publishZoneDirect(id, req.user.id, {
      ...body,
      auction: body.auction
        ? {
            ...body.auction,
            startDate: new Date(body.auction.startDate),
            endDate: new Date(body.auction.endDate),
          }
        : undefined,
      tender: body.tender
        ? { deadline: new Date(body.tender.deadline) }
        : undefined,
    });
  }

  // Gov only: trigger sync from government API
  @Post('sync')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('GOV_ADMIN')
  sync() {
    return this.zones.syncFromGovApi();
  }
}
