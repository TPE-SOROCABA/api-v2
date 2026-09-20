import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

// global: qualquer módulo que altera dado sensível injeta o AuditService sem importar nada
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
