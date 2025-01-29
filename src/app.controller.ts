import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './infra/prisma.service';
import { GeoLocationService } from './app.service';
import { TransactionLogger } from './infra/transaction.logger';

@Controller()
export class AppController {
  logger = new TransactionLogger(AppController.name);
  constructor(private prismaService: PrismaService, private geoService: GeoLocationService) { }

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

  @Get('/geo')
  async getCongregation() {
    this.logger.log('Buscando congregações');
    const latStart = -23.542281;
    const longStart = -47.441133
    // const step init 0.001 até 0.01
    for (let step = 1; step <= 50; step += 1) {
      this.logger.log(`Buscando congregações com step ${step}`);
      const result = await this.geoService.fetchMeetings(latStart, longStart, step)
      // remover duplicados pelo nome
      const unique = result.filter((v, i, a) => a.findIndex(t => (t.name === v.name && t.city === v.city && t.state === v.state)) === i);
      this.logger.log(`Encontrado ${unique.length} congregações`);
      for (const item of unique) {
        this.logger.log(`Verificando congregação ${item.name} - ${item.city} - ${item.state}`);
        const isExist = await this.prismaService.congregations.findFirst({
          where: {
            name: item.name,
            city: item.city,
            state: item.state
          }
        });
        if (!isExist) {
          this.logger.debug(`Criando congregação ${item.name} - ${item.city} - ${item.state}`);
          await this.prismaService.congregations.create({
            data: {
              name: item.name,
              city: item.city,
              state: item.state
            }
          });
          continue;
        }
        this.logger.log(`Congregação ${item.name} - ${item.city} - ${item.state} já existe`);
      }
    }
  }
}

