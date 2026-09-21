import { Module } from '@nestjs/common';
import { IncidentsModule } from '../incidents/incidents.module';
import { SettingsModule } from '../settings/settings.module';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { CoordinationController } from './coordination.controller';
import { CoordinationService } from './coordination.service';
import { PeopleService } from './people.service';

@Module({
  imports: [WaitlistModule, SettingsModule, IncidentsModule],
  controllers: [CoordinationController],
  providers: [CoordinationService, PeopleService],
})
export class CoordinationModule {}
