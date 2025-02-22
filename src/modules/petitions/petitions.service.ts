import * as fs from 'fs';
import { Injectable, NotFoundException } from "@nestjs/common";
import { S3Service } from "src/infra/s3.service";
import { PrismaService } from "src/infra/prisma/prisma.service";
import { TransactionLogger } from "src/infra/transaction.logger";
import { ConvertPdfToImagesUseCase } from "./convert-pdf-to-images.usecase";
import { Petitions, PetitionStatus } from "@prisma/client";
import { FindAllParams } from "./dto/find-all.dto";
import { ImageParameters, OcrService } from 'src/infra/ocr.service';

@Injectable()
export class PetitionsService {
    private readonly logger = new TransactionLogger(PetitionsService.name);

    constructor(
        private readonly s3Service: S3Service,
        private readonly convertPdfToImagesUseCase: ConvertPdfToImagesUseCase,
        private readonly prismaService: PrismaService,
        private readonly ocrService: OcrService
    ) { }

    async getAllPetitions(params: FindAllParams): Promise<Petitions[]> {
        const orConditions = [];
        if (params.search) {
            orConditions.push({ protocol: { contains: params.search } });
            orConditions.push({
                participants: {
                    some: {
                        name: {
                            contains: params.search,
                            mode: 'insensitive'
                        }
                    }
                }
            });
        }

        const petitions = await this.prismaService.petitions.findMany({
            include: {
                participants: true
            },
            where: {
                ...(params.status ? { status: params.status } : {}),
                OR: orConditions.length > 0 ? orConditions : undefined
            }
        });

        if (!petitions) {
            throw new NotFoundException('Nenhuma petição encontrada');
        }

        return petitions;
    }

    async changeStatusToWaitingInformation(id: string): Promise<Petitions> {
        const petition = await this.prismaService.petitions.update({
            where: { id },
            data: {
                status: PetitionStatus.WAITING_INFORMATION
            }
        });

        return petition;
    }

    async uploadFile(file: Express.Multer.File): Promise<Petitions> {
        const { urls, name } = await this.uploadS3AndApplyOCR(file);

        this.logger.log('Gerando protocolo único...');
        let isProtocolUnique = false;
        let protocol: string;
        do {
            protocol = this.generateProtocol();
            this.logger.log(`Protocolo gerado: ${protocol}. Verificando unicidade...`);
            const petition = await this.prismaService.petitions.findUnique({
                where: { protocol }
            });
            isProtocolUnique = Boolean(petition);
            if (isProtocolUnique) {
                this.logger.warn(`Protocolo duplicado encontrado: ${protocol}. Gerando outro...`);
            }
        } while (isProtocolUnique);

        this.logger.log(`Protocolo único confirmado: ${protocol}`);

        this.logger.log('Criando registro na base de dados...');
        const petition = await this.prismaService.petitions.create({
            data: {
                name,
                protocol: protocol,
                publicUrl: urls[0],
                privateUrl: urls[1],
            }
        });
        this.logger.log(`Registro criado com sucesso. ID: ${petition.id}`);

        return petition;
    }

    async updateUploadFile(id: string, file: Express.Multer.File) {
        const petition = await this.prismaService.petitions.findUnique({
            where: { id }
        });
        if (!petition) {
            throw new NotFoundException('Petição não encontrada');
        }

        const keyOne = petition.publicUrl.split('/').pop();
        const keyTwo = petition.privateUrl.split('/').pop();
        await this.s3Service.deleteFile(keyOne, `${process.env.NODE_ENV}-petitions`);
        await this.s3Service.deleteFile(keyTwo, `${process.env.NODE_ENV}-petitions`);

        const { urls, name } = await this.uploadS3AndApplyOCR(file);

        const updatedPetition = await this.prismaService.petitions.update({
            where: { id },
            data: {
                name,
                publicUrl: urls[0],
                privateUrl: urls[1]
            }
        });

        return updatedPetition;
    }

    private async uploadS3AndApplyOCR(file: Express.Multer.File) {
        this.logger.log(`Iniciando upload do arquivo: ${file.originalname}`);

        // Converte o PDF em imagens
        this.logger.log('Convertendo PDF para imagens...');
        const imagesPath = await this.convertPdfToImagesUseCase.execute(file.path);
        this.logger.log(`PDF convertido. Total de imagens geradas: ${imagesPath.length}`);

        const urls = [];
        for (const imagePath of imagesPath) {
            this.logger.log(`Lendo imagem gerada: ${imagePath}`);
            const image = fs.readFileSync(imagePath);

            this.logger.log(`Fazendo upload da imagem para o bucket S3...`);
            const imageUrl = await this.s3Service.uploadFile({
                ...file,
                buffer: image,
                mimetype: 'image/png',
                size: image.length,
                originalname: file.originalname.replace('.pdf', '.png').replace(/ /g, '_'),
            }, `${process.env.NODE_ENV}-petitions`);
            this.logger.log(`Upload concluído. URL da imagem: ${imageUrl}`);
            urls.push(imageUrl);
        }
        const paramsName: ImageParameters = {
            "x": 526,
            "y": 354,
            "width": 1766,
            "height": 66
        }
        const name = await this.ocrService.processImage(imagesPath[0], paramsName);
        imagesPath.forEach(imagePath => {
            fs.unlinkSync(imagePath);
            this.logger.log(`Imagem temporária excluída: ${imagePath}`);
        });
        return { name, urls }
    }

    private generateProtocol() {
        const randomPart = Math.floor(1000 + Math.random() * 9000).toString();
        const randomPart2 = Math.floor(1000 + Math.random() * 9000).toString();
        const randomPart3 = Math.floor(1000 + Math.random() * 9000).toString();
        const protocol = `${randomPart}${randomPart2}${randomPart3}`;
        this.logger.debug(`Protocolo gerado internamente: ${protocol}`);
        return protocol;
    }
}
