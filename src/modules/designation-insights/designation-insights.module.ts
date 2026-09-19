import { Module } from '@nestjs/common';
import { DesignationInsightsController } from './designation-insights.controller';
import { DesignationInsightsService } from './designation-insights.service';

@Module({
  controllers: [DesignationInsightsController],
  providers: [DesignationInsightsService],
})
export class DesignationInsightsModule {}
