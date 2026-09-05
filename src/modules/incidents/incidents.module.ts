import { Module } from '@nestjs/common';
import { GroupScopeService } from 'src/shared/group-scope.service';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

@Module({
  controllers: [IncidentsController],
  providers: [IncidentsService, GroupScopeService],
})
export class IncidentsModule {}
