import { BadRequestException, Controller, Delete, Get, Param, Patch, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { PetitionsService } from './petitions.service';
import { FindOneParams } from 'src/shared/dto/find-one-params.dto';
import { FindAllParams } from './dto/find-all.dto';

@Controller('petitions')
export class PetitionsController {
    constructor(private readonly petitionService: PetitionsService) { }

    @Get()
    async getAllPetitions(@Query() params: FindAllParams) {
        return this.petitionService.getAllPetitions(params);
    }

    @Get(':id')
    async getPetitionById(@Param('id') id: string) {
        return this.petitionService.getPetitionById(id);
    }

    @Patch('waiting-information/:id')
    async changeStatusToWaitingInformation(@Param() params: FindOneParams) {
        return this.petitionService.changeStatusToWaitingInformation(params.id);
    }

    @Post('upload')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: diskStorage({
                destination: './uploads', // Pasta para salvar o PDF recebido
                filename: (req, file, callback) => {
                    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
                    const fileExtName = extname(file.originalname);
                    callback(null, `${uniqueSuffix}${fileExtName}`);
                },
            }),
            fileFilter: (req, file, callback) => {
                if (file.mimetype !== 'application/pdf') {
                    return callback(new BadRequestException('Apenas arquivos PDF são aceitos'), false);
                }
                callback(null, true);
            },
            limits: {
                fileSize: 10 * 1024 * 1024, // Limite de 10MB
            },
        }),
    )
    async uploadFile(
        @UploadedFile() file: Express.Multer.File,
        @Query('bypass') bypass?: string
    ) {
        // Converte string para boolean de forma mais flexível
        const bypassValidation = bypass === '1' || bypass === 'true';
        return this.petitionService.uploadFile(file, bypassValidation);
    }

    @Put('upload/:id')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: diskStorage({
                destination: './uploads', // Pasta para salvar o PDF recebido
                filename: (req, file, callback) => {
                    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
                    const fileExtName = extname(file.originalname);
                    callback(null, `${uniqueSuffix}${fileExtName}`);
                },
            }),
            fileFilter: (req, file, callback) => {
                if (file.mimetype !== 'application/pdf') {
                    return callback(new BadRequestException('Apenas arquivos PDF são aceitos'), false);
                }
                callback(null, true);
            },
            limits: {
                fileSize: 10 * 1024 * 1024, // Limite de 10MB
            },
        }),
    )
    async updateUploadFile(
        @Param() params: FindOneParams, 
        @UploadedFile() file: Express.Multer.File,
        @Query('bypass') bypass?: string
    ) {
        // Converte string para boolean de forma mais flexível
        const bypassValidation = bypass === '1' || bypass === 'true';
        return this.petitionService.updateUploadFile(params.id, file, bypassValidation);
    }

    @Delete(':id')
    async deletePetition(@Param() params: FindOneParams) {
        return this.petitionService.deletePetition(params.id);
    }
}
