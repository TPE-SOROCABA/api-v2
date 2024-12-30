import { BadRequestException, Controller, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PDFService } from './pdf.service';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Response } from 'express';

@Controller('pdf')
export class PDFController {
    constructor(private readonly pdfService: PDFService) { }
    // configurar aceitar apenas arquivos PDF
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
    async uploadFile(@UploadedFile() file: Express.Multer.File, @Res() res: Response) {
        console.log(`Received file ${file.originalname}`);
        const output = await this.pdfService.convertPdfToImages(file.path);
        // return binary data
        const fs = require('fs');
        // Lê o arquivo de imagem gerado e retorna como resposta
        const imagePath = output[0];  // Supondo que a conversão gere um array com caminhos das imagens.

        const imageBuffer = fs.readFileSync(imagePath);  // Lê o conteúdo do arquivo da imagem

        res.set({
            'Content-Type': 'image/png',  // Ajuste o tipo da imagem, pode ser 'image/jpeg' ou outro
            'Content-Length': imageBuffer.length,
        });

        // Envia a imagem como resposta
        res.end(imageBuffer);

    }
}
