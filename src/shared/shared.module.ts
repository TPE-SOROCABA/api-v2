import { Global, Module } from '@nestjs/common';
import { PrismaModule } from 'src/infra/prisma/prisma.module';
import { MessageGeneratorService } from './message-generator.service';
import { ShortLinkService } from './short-link.service';

/** Utilitários compartilhados entre módulos (sem estado próprio, sem infra). */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [MessageGeneratorService, ShortLinkService],
  exports: [MessageGeneratorService, ShortLinkService],
})
export class SharedModule {}
