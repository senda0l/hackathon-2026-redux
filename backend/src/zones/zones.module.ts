import { Module } from '@nestjs/common';
import { ZonesService } from './zones.service';
import { ZonesController } from './zones.controller';
import { ZonesSeedService } from './zones-seed.service';

@Module({
  providers: [ZonesService, ZonesSeedService],
  controllers: [ZonesController],
  exports: [ZonesService],
})
export class ZonesModule {}
