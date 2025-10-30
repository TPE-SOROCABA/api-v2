import {
    Controller,
    Delete,
    Get,
    Param,
    UseGuards,
    HttpCode,
    HttpStatus,
    UsePipes,
    ValidationPipe
} from '@nestjs/common';
import { DesignationsService } from './designations.service';
import { FindOneDesignationParams } from './dto/find-one-params.dto';
import { AuthGuard } from 'src/auth/auth.guard';

@Controller('designations')
@UseGuards(AuthGuard)
export class DesignationsController {
    constructor(private readonly designationsService: DesignationsService) { }

    @Get(':id')
    @UsePipes(new ValidationPipe({ transform: true }))
    findOne(@Param() params: FindOneDesignationParams) {
        return this.designationsService.findOne(params.id);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    @UsePipes(new ValidationPipe({ transform: true }))
    remove(@Param() params: FindOneDesignationParams) {
        return this.designationsService.remove(params.id);
    }
}