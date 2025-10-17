import * as FS from 'fs';
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/infra/prisma/prisma.service";
import { TransactionLogger } from "src/infra/transaction.logger";
import { ConvertPdfToImagesUseCase } from "./convert-pdf-to-images.usecase";
import { Petitions, PetitionStatus } from "@prisma/client";
import { FindAllParams } from "./dto/find-all.dto";
import { ImageParameters, OcrService } from 'src/infra/ocr.service';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { FirebaseService } from 'src/infra/firebase.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PetitionsService {
    private readonly logger = new TransactionLogger(PetitionsService.name);

    constructor(
        private readonly convertPdfToImagesUseCase: ConvertPdfToImagesUseCase,
        private readonly prismaService: PrismaService,
        private readonly ocrService: OcrService,
        private readonly firebaseService: FirebaseService,
    ) { }

    async getAllPetitions(params: FindAllParams): Promise<Petitions[]> {
        const orConditions = [];
        if (params.search) {
            orConditions.push({ protocol: { contains: params.search } });
            orConditions.push({ name: { contains: params.search, mode: 'insensitive' } });
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

    async getPetitionById(id: string): Promise<Petitions> {
        const petition = await this.prismaService.petitions.findUnique({
            where: { id },
            include: {
                participants: true
            },
        });
        if (!petition) {
            throw new NotFoundException('Petição não encontrada');
        }
        return petition;
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

    async uploadFile(file: Express.Multer.File, bypass: boolean = false): Promise<Petitions> {
        const hash = await this.checkFileHash(file);
        this.logger.log(`Iniciando upload do arquivo: ${file.originalname}${bypass ? ' (modo bypass ativo)' : ''}`);
        const imagesPath = await this.convertPdfAndImage(file, bypass);
        const [urls, name] = await Promise.all([
            this.uploadS3(imagesPath, file),
            this.extractNameFromImage(imagesPath[0])
        ])

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
                hash: hash,
            }
        });
        this.logger.log(`Registro criado com sucesso. ID: ${petition.id}`);

        return petition;
    }

    async updateUploadFile(id: string, file: Express.Multer.File, bypass: boolean = false) {
        const hash = await this.checkFileHash(file);
        this.logger.log(`Iniciando atualização do arquivo: ${file.originalname}${bypass ? ' (modo bypass ativo)' : ''}`);
        const petition = await this.prismaService.petitions.findUnique({
            where: { id }
        });
        if (!petition) {
            throw new NotFoundException('Petição não encontrada');
        }

        const keyOne = petition.publicUrl.split('/').pop();
        const keyTwo = petition.privateUrl.split('/').pop();
        this.logger.log(`Deletando arquivos antigos: ${keyOne} e ${keyTwo}`);
        await this.firebaseService.deleteFileByUrl(petition.publicUrl).catch(() => null);
        await this.firebaseService.deleteFileByUrl(petition.privateUrl).catch(() => null);
        const imagesPath = await this.convertPdfAndImage(file, bypass);
        const urls = await this.uploadS3(imagesPath, file);

        const updatedPetition = await this.prismaService.petitions.update({
            where: { id },
            data: {
                publicUrl: urls[0],
                privateUrl: urls[1],
                hash: hash,
            }
        });

        return updatedPetition;
    }

    async checkFileHash(file: Express.Multer.File): Promise<string> {
        this.logger.log(`Iniciando verificação de hash do arquivo: ${file.originalname}`);
        const fileBuffer = await fs.readFile(file.path);
        const hash = this.generateHash(fileBuffer);
        this.logger.log(`Hash gerado para o arquivo: ${hash}`);
        const petition = await this.prismaService.petitions.findFirst({
            where: {
                hash: hash
            }
        });
        if (petition) {
            this.logger.log(`Petição já existe com o hash: ${hash}`);
            this.logger.log(`Excluindo arquivo PDF original: ${file.path}`);
            await fs.unlink(file.path);
            this.logger.log(`Arquivo PDF original excluído com sucesso.`);
            throw new ConflictException(`Petição já existe nome: ${petition.name}`);
        } else {
            this.logger.log(`Petição não encontrada com o hash: ${hash}`);
        }
        return hash;
    }

    private async uploadS3(imagesPath: string[], file: Express.Multer.File) {
        const uploadPromises = imagesPath.map(async (imagePath) => {
            this.logger.log(`Lendo imagem gerada: ${imagePath}`);
            const image = FS.readFileSync(imagePath);
            const uuid = uuidv4();
            this.logger.log(`Fazendo upload da imagem para o Firebase...`);
            const imageUrl = await this.firebaseService.uploadFile({
                ...file,
                buffer: image,
                mimetype: 'image/png',
                size: image.length,
                originalname: `${uuid}.png`
            }, `petitions/${uuid}.png`);

            this.logger.log(`Upload concluído. URL da imagem: ${imageUrl}`);
            return imageUrl;
        });

        const urls = await Promise.all(uploadPromises);
        return urls
    }

    private async convertPdfAndImage(file: Express.Multer.File, bypass: boolean = false): Promise<string[]> {
        this.logger.log(`Iniciando upload do arquivo: ${file.originalname}${bypass ? ' (modo bypass ativo)' : ''}`);
        // Converte o PDF em imagens
        this.logger.log('Convertendo PDF para imagens...');
        const imagesPath = await this.convertPdfToImagesUseCase.execute(file.path, bypass);
        this.logger.log(`PDF convertido. Total de imagens geradas: ${imagesPath.length}`);
        return imagesPath;
    }

    private async extractNameFromImage(imagePath: string): Promise<string> {
        this.logger.log(`Iniciando OCR para extrair nome da imagem: ${imagePath}`);
        const nameParams: ImageParameters = {
            x: 526,
            y: 354,
            width: 1766,
            height: 66
        };
        const name = await this.ocrService.processImage(imagePath, nameParams);
        this.logger.log(`Nome extraído da imagem: ${name}`);
        return name;
    }

    private generateProtocol() {
        const randomPart = Math.floor(1000 + Math.random() * 9000).toString();
        const randomPart2 = Math.floor(1000 + Math.random() * 9000).toString();
        const randomPart3 = Math.floor(1000 + Math.random() * 9000).toString();
        const protocol = `${randomPart}${randomPart2}${randomPart3}`;
        this.logger.debug(`Protocolo gerado internamente: ${protocol}`);
        return protocol;
    }

    private generateHash(buffer: Buffer) {
        return createHash('sha256').update(buffer).digest('hex');
    }
}
