import { Injectable } from "@nestjs/common";
import { S3Service } from "src/infra/s3.service";
import { ConvertPdfToImagesUseCase } from "./convert-pdf-to-images.usecase";
import * as fs from 'fs';

@Injectable()
export class PetitionService {
    constructor(
        private readonly s3Service: S3Service,
        private readonly convertPdfToImagesUseCase: ConvertPdfToImagesUseCase,
    ) { }
    async uploadFile(file: Express.Multer.File) {
        const imagesPath = await this.convertPdfToImagesUseCase.execute(file.path);
        for (const imagePath of imagesPath) {
            const image = fs.readFileSync(imagePath);
            const imageUrl = await this.s3Service.uploadFile({
                ...file,
                buffer: image,
                mimetype: 'image/png',
                size: image.length,
                originalname: file.originalname.replace('.pdf', '.png').replace(/ /g, '_'),
            }, `${process.env.NODE_ENV}-petitions`);
            console.log('Imagem salva no S3:', imageUrl);
        }
    }
}