import { Module } from '@nestjs/common';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { CoordinationController } from './coordination.controller';
import { CoordinationService } from './coordination.service';

@Module({
  imports: [WaitlistModule],
  controllers: [CoordinationController],
  providers: [CoordinationService],
})
export class CoordinationModule {}
