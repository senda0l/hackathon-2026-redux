import { Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(config: ConfigService) {
    const connectionString = config.get<string>('DATABASE_URL')
    if (!connectionString) {
      throw new Error('DATABASE_URL is not configured')
    }

    super({
      adapter: new PrismaPg({ connectionString }),
    })
  }

  async onModuleInit() {
    await this.$connect()
  }
}
