import { Global, Module } from '@nestjs/common';
import { PrismaModule } from 'src/infra/prisma/prisma.module';
import { MessageGeneratorService } from './message-generator.service';
import { ShortLinkService } from './short-link.service';
import { GroupSendService } from './group-send.service';
import { SupplyRotationService } from './supply-rotation.service';

/** Utilitários compartilhados entre módulos (sem estado próprio, sem infra). */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [MessageGeneratorService, ShortLinkService, GroupSendService, SupplyRotationService],
  exports: [MessageGeneratorService, ShortLinkService, GroupSendService, SupplyRotationService],
})
export class SharedModule {}
