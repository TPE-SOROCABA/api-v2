import { Module } from '@nestjs/common';
import { GroupScopeService } from 'src/shared/group-scope.service';
import { DesignationIncidentsController } from './designation-incidents.controller';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

@Module({
  controllers: [IncidentsController, DesignationIncidentsController],
  providers: [IncidentsService, GroupScopeService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
