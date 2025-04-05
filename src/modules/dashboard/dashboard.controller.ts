import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { FindAllParams } from './dto/find-params.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  async getAllPetitions(@Query() params: FindAllParams) {
    return this.dashboardService.getAllDashboard(params);
  }
}
