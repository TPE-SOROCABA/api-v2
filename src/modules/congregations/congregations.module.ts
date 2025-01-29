import { Module } from '@nestjs/common';
import { CongregationsService } from './congregations.service';
import { CongregationsController } from './congregations.controller';
import { GeoLocationService } from './geo-location.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  controllers: [CongregationsController],
  providers: [CongregationsService, GeoLocationService],
})
export class CongregationsModule { }
