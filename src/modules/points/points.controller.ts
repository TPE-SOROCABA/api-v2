import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ValidationPipe,
  UsePipes,
  HttpStatus,
  HttpCode,
  MethodNotAllowedException,
  BadRequestException
} from '@nestjs/common';
import { PointsService } from './points.service';
import { CreatePointDto } from './dto/create-point.dto';
import { UpdatePointDto } from './dto/update-point.dto';
import { AuthGuard } from '../../auth/auth.guard';

@Controller()
@UseGuards(AuthGuard)
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get('groups/:groupId/points')
  async getGroupPoints(@Param('groupId') groupId: string) {
    return this.pointsService.getGroupPoints(groupId);
  }

  @Post('groups/:groupId/points')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ 
    whitelist: true, 
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => {
      const details = {};
      errors.forEach(error => {
        if (error.constraints) {
          details[error.property] = Object.values(error.constraints)[0];
        }
      });
      throw new BadRequestException({
        success: false,
        error: 'Validation error',
        message: 'Dados inválidos',
        details
      });
    }
  }))
  async createGroupPoint(
    @Param('groupId') groupId: string,
    @Body() createPointDto: CreatePointDto
  ) {
    return this.pointsService.createGroupPoint(groupId, createPointDto);
  }

  @Put('points/:pointId')
  @UsePipes(new ValidationPipe({ 
    whitelist: true, 
    forbidNonWhitelisted: true,
    transform: true,
    skipMissingProperties: true,
    exceptionFactory: (errors) => {
      const details = {};
      errors.forEach(error => {
        if (error.constraints) {
          details[error.property] = Object.values(error.constraints)[0];
        }
      });
      throw new BadRequestException({
        success: false,
        error: 'Validation error',
        message: 'Dados inválidos',
        details
      });
    }
  }))
  async updateGroupPoint(
    @Param('pointId') pointId: string,
    @Body() updatePointDto: UpdatePointDto
  ) {
    return this.pointsService.updateGroupPoint(pointId, updatePointDto);
  }

  @Delete('points/:pointId')
  @HttpCode(HttpStatus.METHOD_NOT_ALLOWED)
  async deleteGroupPoint() {
    throw new MethodNotAllowedException({
      success: false,
      error: 'Method not allowed',
      message: 'Exclusão de pontos não é permitida (preservação de histórico)'
    });
  }
}