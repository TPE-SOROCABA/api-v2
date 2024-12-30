import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './infra/prisma.service';

@Controller()
export class AppController {
  constructor(private prismaService: PrismaService) {}

  @Get('/health-check')
  async healthCheck() {
    const [{ max_connections }] = (await this.prismaService.$queryRaw`show max_connections`) as { max_connections: string }[];
    const [{ count: countIdle }] = (await this.prismaService
      .$queryRaw`select count(1)  from pg_stat_activity where state = 'idle' and datname = 'tpedigital'`) as {
      count: BigInt;
    }[];
    const [{ count: countActive }] = (await this.prismaService
      .$queryRaw`select count(1)  from pg_stat_activity where state = 'active' and datname = 'tpedigital'`) as {
      count: BigInt;
    }[];

    return {
      message: `[${new Date().toISOString()}] - O servidor está em execução - Produção!`,
      database_info: {
        active: +countActive.toString(),
        idle: +countIdle.toString(),
        max_connections: +max_connections,
      },
    };
  }
}
