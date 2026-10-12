import { Module } from '@nestjs/common';
import { GroupScopeService } from 'src/shared/group-scope.service';
import { GroupChangeRequestsController } from './group-change-requests.controller';
import { GroupChangeRequestsService } from './group-change-requests.service';

@Module({
  controllers: [GroupChangeRequestsController],
  providers: [GroupChangeRequestsService, GroupScopeService],
  exports: [GroupChangeRequestsService],
})
export class GroupChangeRequestsModule {}
