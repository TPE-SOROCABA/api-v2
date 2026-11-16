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
import axios from 'axios';
import { AnalyzeAction, decideAction, findPetitionMatches, isUsableName, PetitionMatch } from './petition-matcher';

export type AnalyzeResult = {
    action: AnalyzeAction | 'duplicate';
    extractedName: string | null;
    nameReadable: boolean;
    matches: PetitionMatch[];
    duplicateOf?: { id: string; name: string; status: string; protocol: string };
};

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
        let query = `
            SELECT DISTINCT p.*
            FROM petitions p
            LEFT JOIN participants pt ON p.id = pt.petition_id
            LEFT JOIN congregations c ON pt.congregation_id = c.id
            WHERE 1=1
        `;

        const queryParams: any[] = [];
        let paramIndex = 1;

        // Filtro por status se fornecido
        if (params.status) {
            query += ` AND p.status = $${paramIndex}::"PetitionStatus"`;
            queryParams.push(params.status);
            paramIndex++;
        }

        // Busca dinâmica se fornecida
        if (params.search) {
            query += ` AND (
                p.name ILIKE $${paramIndex} OR
                pt.name ILIKE $${paramIndex} OR
                pt.email ILIKE $${paramIndex} OR
                pt.phone ILIKE $${paramIndex} OR
                c.name ILIKE $${paramIndex}
            )`;
            queryParams.push(`%${params.search}%`);
            paramIndex++;
        }

        query += ` ORDER BY p.created_at DESC`;

        const petitionsResult = await this.prismaService.$queryRawUnsafe(query, ...queryParams) as any[];

        if (!petitionsResult || petitionsResult.length === 0) {
            throw new NotFoundException('Nenhuma petição encontrada');
        }

        // Buscar os participantes para cada petição encontrada
        const petitionIds = petitionsResult.map((p: any) => p.id);

        const petitions = await this.prismaService.petitions.findMany({
            where: {
                id: { in: petitionIds }
            },
            include: {
                participants: {
                    include: {
                        participantsGroup: {
                            include: {
                                group: true
                            }
                        },
                        congregation: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

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

    async excludePetition(id: string): Promise<Petitions> {
        this.logger.log(`Iniciando exclusão da petição: ${id}`);

        // Verifica se a petição existe
        const petition = await this.prismaService.petitions.findUnique({
            where: { id },
            include: {
                participants: true
            }
        });

        if (!petition) {
            throw new NotFoundException('Petição não encontrada');
        }

        // Remove todos os participantes da petição de todos os grupos
        if (petition.participants && petition.participants.length > 0) {
            this.logger.log(`Removendo ${petition.participants.length} participante(s) de todos os grupos`);

            const participantIds = petition.participants.map(p => p.id);

            await this.prismaService.participantsGroups.deleteMany({
                where: {
                    participantId: { in: participantIds }
                }
            });

            this.logger.log('Participantes removidos de todos os grupos com sucesso');
        }

        // Atualiza o status da petição para EXCLUDED
        const updatedPetition = await this.prismaService.petitions.update({
            where: { id },
            data: {
                status: PetitionStatus.EXCLUDED
            },
            include: {
                participants: true
            }
        });

        this.logger.log(`Petição ${id} excluída com sucesso - Status alterado para EXCLUDED`);

        return updatedPetition;
    }

    async activatePetition(id: string): Promise<Petitions> {
        this.logger.log(`Iniciando ativação da petição: ${id}`);

        // Verifica se a petição existe
        const petition = await this.prismaService.petitions.findUnique({
            where: { id }
        });

        if (!petition) {
            throw new NotFoundException('Petição não encontrada');
        }

        // Atualiza o status da petição para WAITING
        const updatedPetition = await this.prismaService.petitions.update({
            where: { id },
            data: {
                status: PetitionStatus.WAITING
            },
            include: {
                participants: true
            }
        });

        this.logger.log(`Petição ${id} ativada com sucesso - Status alterado para WAITING`);

        return updatedPetition;
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

        // Chama webhook após criação da petição (não essencial - fire and forget)
        this.callPetitionWebhook(petition.id).catch(() => {
            // Ignora erros silenciosamente
        });

        return petition;
    }

    async updateUploadFile(id: string, file: Express.Multer.File, bypass: boolean = false) {
        const hash = await this.checkFileHash(file, id);
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

    /**
     * Confere se o PDF já existe. Regras:
     *  - petição EXCLUÍDA não bloqueia: libera o hash dela (a coluna é única) e segue;
     *  - na atualização de uma petição (currentPetitionId), PDF igual ao que ela já tem
     *    é recusado com mensagem própria;
     *  - qualquer outra petição com o mesmo PDF bloqueia, como antes.
     */
    async checkFileHash(file: Express.Multer.File, currentPetitionId?: string): Promise<string> {
        this.logger.log(`Iniciando verificação de hash do arquivo: ${file.originalname}`);
        const hash = await this.computeFileHash(file);
        this.logger.log(`Hash gerado para o arquivo: ${hash}`);
        const petition = await this.prismaService.petitions.findFirst({
            where: {
                hash: hash
            }
        });
        if (!petition) {
            this.logger.log(`Petição não encontrada com o hash: ${hash}`);
            return hash;
        }

        if (currentPetitionId && petition.id === currentPetitionId) {
            await this.discardUpload(file);
            throw new ConflictException(`Este PDF é igual ao que já está nesta petição (${petition.name}). Envie a versão nova do arquivo.`);
        }

        if (petition.status === PetitionStatus.EXCLUDED) {
            this.logger.log(`Hash pertence a petição excluída (${petition.id}); liberando o hash para o novo envio.`);
            await this.releaseHashOfExcluded(petition.id, hash);
            return hash;
        }

        this.logger.log(`Petição já existe com o hash: ${hash}`);
        await this.discardUpload(file);
        throw new ConflictException(`Petição já existe nome: ${petition.name}`);
    }

    /** Hash de uma petição excluída vira um valor que nunca mais colide (coluna `hash` é única). */
    private async releaseHashOfExcluded(petitionId: string, hash: string): Promise<void> {
        await this.prismaService.petitions.update({
            where: { id: petitionId },
            data: { hash: `${hash}-excluida-${petitionId}` },
        });
    }

    private async computeFileHash(file: Express.Multer.File): Promise<string> {
        const fileBuffer = await fs.readFile(file.path);
        return this.generateHash(fileBuffer);
    }

    private async discardUpload(file: Express.Multer.File): Promise<void> {
        this.logger.log(`Excluindo arquivo PDF original: ${file.path}`);
        await fs.unlink(file.path).catch(() => null);
    }

    /**
     * Analisa um PDF ANTES de enviar: lê o nome (OCR), compara com o cadastro e diz se parece
     * atualização de alguém que já existe ou pessoa nova. Não grava nada e limpa os temporários.
     */
    async analyzeFile(file: Express.Multer.File, bypass: boolean = false): Promise<AnalyzeResult> {
        let imagePath: string | null = null;
        try {
            const hash = await this.computeFileHash(file);
            const sameFile = await this.prismaService.petitions.findFirst({ where: { hash } });
            if (sameFile && sameFile.status !== PetitionStatus.EXCLUDED) {
                return {
                    action: 'duplicate',
                    extractedName: sameFile.name,
                    nameReadable: true,
                    matches: [],
                    duplicateOf: { id: sameFile.id, name: sameFile.name, status: sameFile.status, protocol: sameFile.protocol },
                };
            }

            imagePath = await this.convertPdfToImagesUseCase.extractFirstPage(file.path, bypass);
            const extractedName = await this.extractNameFromImage(imagePath);
            const nameReadable = isUsableName(extractedName);

            const candidates = nameReadable
                ? await this.prismaService.petitions.findMany({
                    select: {
                        id: true,
                        name: true,
                        status: true,
                        createdAt: true,
                        updatedAt: true,
                        participants: {
                            select: {
                                name: true,
                                congregation: { select: { name: true } },
                                participantsGroup: { select: { group: { select: { name: true } } } },
                            },
                        },
                    },
                })
                : [];

            const matches = findPetitionMatches(extractedName, candidates);
            return { action: decideAction(matches), extractedName, nameReadable, matches };
        } finally {
            await fs.unlink(file.path).catch(() => null);
            if (imagePath) await fs.unlink(imagePath).catch(() => null);
        }
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

    async deletePetition(id: string): Promise<{ message: string }> {
        this.logger.log(`Iniciando exclusão da petição: ${id}`);

        // Verifica se a petição existe
        const petition = await this.prismaService.petitions.findUnique({
            where: { id },
            include: {
                participants: true
            }
        });

        if (!petition) {
            throw new NotFoundException('Petição não encontrada');
        }

        // Verifica se há participantes vinculados
        if (petition.participants && petition.participants.length > 0) {
            this.logger.warn(`Tentativa de exclusão de petição com participantes: ${id}`);
            throw new ConflictException(`Não é possível excluir a petição. Existem ${petition.participants.length} participante(s) vinculado(s).`);
        }

        this.logger.log(`Deletando arquivos da petição: ${id}`);

        // Deleta os arquivos do Firebase
        try {
            await this.firebaseService.deleteFileByUrl(petition.publicUrl).catch(() => {
                this.logger.warn(`Arquivo público não encontrado ou já deletado: ${petition.publicUrl}`);
            });

            await this.firebaseService.deleteFileByUrl(petition.privateUrl).catch(() => {
                this.logger.warn(`Arquivo privado não encontrado ou já deletado: ${petition.privateUrl}`);
            });

            this.logger.log(`Arquivos deletados com sucesso para petição: ${id}`);
        } catch (error) {
            this.logger.error(`Erro ao deletar arquivos da petição ${id}:`, error);
            // Continua com a exclusão mesmo se houver erro nos arquivos
        }

        // Exclui a petição do banco de dados
        await this.prismaService.petitions.delete({
            where: { id }
        });

        this.logger.log(`Petição excluída com sucesso: ${id}`);

        return {
            message: `Petição ${petition.name} (${petition.protocol}) excluída com sucesso`
        };
    }

    private async callPetitionWebhook(petitionId: string): Promise<void> {
        try {
            const webhookUrl = `https://auto.wfelipe.com.br/webhook/b1daef03-400f-472a-826b-7ec92c2ea883/${petitionId}`;
            this.logger.log(`Chamando webhook para petição: ${petitionId}`);

            const response = await axios.post(webhookUrl, {}, {
                timeout: 5000, // 5 segundos de timeout
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            this.logger.log(`Webhook chamado com sucesso para petição ${petitionId}. Status: ${response.status}`);
        } catch (error) {
            // Falha silenciosa - não afeta o fluxo principal
            this.logger.warn(`Falha ao chamar webhook para petição ${petitionId}:`, error.message);
        }
    }

    private generateHash(buffer: Buffer) {
        return createHash('sha256').update(buffer).digest('hex');
    }
}
