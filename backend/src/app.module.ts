import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ZonesModule } from './zones/zones.module';
import { AuctionsModule } from './auctions/auctions.module';
import { TendersModule } from './tenders/tenders.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ZonesModule,
    AuctionsModule,
    TendersModule,
  ],
})
export class AppModule {}
