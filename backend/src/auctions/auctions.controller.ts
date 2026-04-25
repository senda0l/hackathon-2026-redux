import { Controller, Get, Post, Param, Body, UseGuards, Request } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { AuctionsService } from './auctions.service'
import { Roles, RolesGuard } from '../auth/roles.guard'

@Controller('auctions')
export class AuctionsController {
  constructor(private auctions: AuctionsService) {}

  @Get()
  getAll() {
    return this.auctions.getAll()
  }

  @Get('bids/mine')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('COMPANY')
  getMyBids(@Request() req) {
    return this.auctions.getMyBids(req.user.id)
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.auctions.getById(id)
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('GOV_ADMIN')
  create(@Body() body: { zoneId: string; startDate: string; endDate: string; minBid: number; maxFinalists: number }) {
    return this.auctions.create(
      body.zoneId,
      new Date(body.startDate),
      new Date(body.endDate),
      body.minBid,
      body.maxFinalists ?? 6,
    )
  }

  @Post(':id/bid')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('COMPANY')
  placeBid(@Param('id') id: string, @Body() body: { amount: number }, @Request() req) {
    return this.auctions.placeBid(id, req.user.id, body.amount)
  }

  @Post(':id/finalists')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('GOV_ADMIN')
  selectFinalists(@Param('id') id: string) {
    return this.auctions.selectFinalists(id)
  }
}
