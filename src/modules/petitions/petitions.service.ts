import * as fs from 'fs';
import { Injectable, NotFoundException } from "@nestjs/common";
import { S3Service } from "src/infra/s3.service";
import { PrismaService } from "src/infra/prisma.service";
import { TransactionLogger } from "src/infra/transaction.logger";
import { ConvertPdfToImagesUseCase } from "./convert-pdf-to-images.usecase";
import { Petitions, PetitionStatus } from "@prisma/client";
import { FindAllParams } from "./dto/find-all.dto";

@Injectable()
export class PetitionsService {
    private readonly logger = new TransactionLogger(PetitionsService.name);

    constructor(
        private readonly s3Service: S3Service,
        private readonly convertPdfToImagesUseCase: ConvertPdfToImagesUseCase,
        private readonly prismaService: PrismaService
    ) { }

    async getAllPetitions(params: FindAllParams): Promise<Petitions[]> {
        const petitions = await this.prismaService.petitions.findMany({
            include: {
                Participants: true
            },
            ...(params.status && { where: { status: params.status } }),
            ...(params.protocol && { where: { protocol: { contains: params.protocol } } }),
        });

        if (!petitions) {
            throw new NotFoundException('Nenhuma petição encontrada');
        }

        const petitionsWithParticipants = petitions.map(petition => {
            const { Participants, ...rest } = petition;
            return {
                ...rest,
                participant: Participants.length > 0 ? Participants[0] : null
            };
        })

        return petitionsWithParticipants;
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
        const urls = await this.uploadS3(file);

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

        const urls = await this.uploadS3(file);

        const updatedPetition = await this.prismaService.petitions.update({
            where: { id },
            data: {
                publicUrl: urls[0],
                privateUrl: urls[1]
            }
        });

        return updatedPetition;
    }

    private async uploadS3(file: Express.Multer.File) {
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

            fs.unlinkSync(imagePath);
            this.logger.log(`Imagem temporária excluída: ${imagePath}`);

            urls.push(imageUrl);
        }
        return urls;
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
