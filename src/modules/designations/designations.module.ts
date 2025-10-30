import { Module } from '@nestjs/common';
import { DesignationsService } from './designations.service';
import { DesignationsController } from './designations.controller';
import { PrismaModule } from 'src/infra/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DesignationsController],
  providers: [DesignationsService],
  exports: [DesignationsService]
})
export class DesignationsModule {}