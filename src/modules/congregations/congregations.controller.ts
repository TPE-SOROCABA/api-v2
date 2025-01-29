import { Controller, Get, Post, Query } from '@nestjs/common';
import { CongregationsService } from './congregations.service';
import { FindAllParams } from './dto/find-one-params.dto';

@Controller('congregations')
export class CongregationsController {
  constructor(private readonly congregationsService: CongregationsService) {}

  @Get()
  findAll(@Query() params: FindAllParams) {
    return this.congregationsService.findAll(params.name);
  }

  @Post('worker')
  updateCongregations() {
    return this.congregationsService.updateCongregations();
  }
}
