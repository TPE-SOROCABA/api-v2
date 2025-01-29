import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { GeoLocationService } from './geo-location.service';

@Injectable()
export class CongregationsService {
  logger = new Logger(CongregationsService.name);
  constructor(
    private prismaService: PrismaService,
    private geoService: GeoLocationService
  ) { }

  async findAll(name: string) {
    return this.prismaService.congregations.findMany({
      where: {
        name: {
          contains: name,
          mode: 'insensitive'
        }
      }
    });
  }

  @Cron(CronExpression.EVERY_WEEKDAY)
  async updateCongregations() {
    this.logger.log('Buscando congregações');
    const latStart = -23.507364;
    const longStart = -47.475995;

    for (let step = 1; step <= 100; step += 1) {
      this.logger.log(`Buscando congregações com step ${step}`);
      const result = await this.geoService.fetchMeetings(latStart, longStart, step)
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
