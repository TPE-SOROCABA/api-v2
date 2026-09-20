import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { CoordinationController } from './coordination.controller';
import { CoordinationService } from './coordination.service';
import { PeopleService } from './people.service';

@Module({
  imports: [WaitlistModule, SettingsModule],
  controllers: [CoordinationController],
  providers: [CoordinationService, PeopleService],
})
export class CoordinationModule {}
