import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  logger = new Logger(PrismaService.name);
  async onModuleInit() {
    let retries = 5;
    while (retries > 0) {
      try {
        await this.$connect();
        this.logger.debug('Conexão estabelecida com o banco de dados.');
        break;
      } catch (error) {
        this.logger.error(`Erro ao conectar: ${error.message}. Tentando novamente...`);
        retries--;
        await new Promise((res) => setTimeout(res, (5 - retries) * 1000)); // Exponential backoff
      }
    }
  
    if (retries === 0) {
      this.logger.error('Não foi possível conectar ao banco após várias tentativas.');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
