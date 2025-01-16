import { BadRequestException, Controller, Get, Param, Patch, Post, Put, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { PetitionsService } from './petitions.service';
import { FindOneParams } from 'src/shared/dto/find-one-params.dto';
import { recognize } from 'tesseract.js';

@Controller('petitions')
export class PetitionsController {
    constructor(private readonly petitionService: PetitionsService) { }

    @Get()
    async getAllPetitions() {
        return this.petitionService.getAllPetitions();
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
        }),
    )
    async uploadFile(@UploadedFile() file: Express.Multer.File) {
        return this.petitionService.uploadFile(file);
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
        }),
    )
    async updateUploadFile(@Param() params: FindOneParams, @UploadedFile() file: Express.Multer.File) {
        return this.petitionService.updateUploadFile(params.id, file);
    }

    // convert pdf to image
    // @Post('convert-pdf-to-image')
    @Post('convert-pdf-to-image')
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
        }),
    )
    async convertPdfToImage(@UploadedFile() file: Express.Multer.File) {
        const [imagePath] = await this.petitionService.convertPdfToImage(file);
        
        const { data: { text } } = await recognize(imagePath, "eng");
        console.log("Texto extraído:", text);

        const fields = extractFieldsFromText(text);
        console.log("Campos extraídos:", fields);

        return fields;
    }
}


function extractFieldsFromText(text:string) {
    const lines = text.split("\n");
    const data = {};

    // Expressões regulares para capturar campos específicos
    const regexes = {
        email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    };

    // Itera sobre as linhas e tenta extrair os campos
    for (const [key, regex] of Object.entries(regexes)) {
        for (const line of lines) {
            const match = line.match(regex);
            if (match) {
                console.log(`Campo encontrado: ${key} = ${match}`);
                if(key === 'phone'){
                    data[key] = match[0].replace(/[^0-9]/g, '');
                    break;
                } 
                    data[key] = match[1].trim();
                    break; 
            }
        }
    }

    return data;
}