import { BadRequestException, Injectable } from '@nestjs/common';
import { TransactionLogger } from 'src/infra/transaction.logger';
import { fromPath } from 'pdf2pic';
import pdfParse from 'pdf-parse';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ConvertPdfToImagesUseCase {
    private readonly logger = new TransactionLogger(ConvertPdfToImagesUseCase.name);

    async execute(pdfPath: string, bypass = false): Promise<string[]> {
        this.logger.log(`Iniciando validação do PDF no caminho: ${pdfPath}`);

        if (!bypass) {
            await this.validatePdf(pdfPath, 'UBLICO ESPECIAL');
            this.logger.log('PDF validado com sucesso.');
        }

        const outputDir = path.join(__dirname, '..', '..', 'output');
        this.logger.log(`Verificando diretório de saída: ${outputDir}`);

        if (!fs.existsSync(outputDir)) {
            this.logger.log('Diretório de saída não encontrado. Criando...');
            fs.mkdirSync(outputDir, { recursive: true });
            this.logger.log('Diretório de saída criado com sucesso.');
        }

        const converter = fromPath(pdfPath, {
            density: 300, // Qualidade da imagem
            width: 2480, // Largura da imagem (A4 - 300 DPI)
            height: 3508, // Altura da imagem (A4 - 300 DPI)
            savePath: outputDir, // Diretório de saída
            format: 'png', // Formato da imagem
            saveFilename: uuidv4(), // Nome da imagem
        });

        const totalPages = 2; // Alterar para o número de páginas, se necessário
        this.logger.log(`Iniciando conversão do PDF em ${totalPages} páginas para imagens...`);
        const images: string[] = [];

        for (let i = 1; i <= totalPages; i++) {
            try {
                this.logger.log(`Convertendo página ${i} do PDF...`);
                const result = await converter(i);
                images.push(result.path);
                this.logger.log(`Página ${i} convertida com sucesso. Caminho: ${result.path}`);
            } catch (error) {
                this.logger.error(`Erro ao converter a página ${i}: ${error.message}`);
            }
        }

        this.logger.log(`Excluindo arquivo PDF original: ${pdfPath}`);
        fs.unlinkSync(pdfPath);

        if (images.length !== totalPages) {
            this.logger.error(
                `Erro ao converter PDF: número de imagens geradas (${images.length}) diferente do esperado (${totalPages}).`
            );
            throw new BadRequestException('Erro ao converter PDF para imagens, quantidade de imagens diferente do esperado.');
        }

        this.logger.log('Conversão do PDF para imagens concluída com sucesso.');
        return images;
    }

    private async validatePdf(filePath: string, searchText: string): Promise<void> {
        this.logger.log(`Validando conteúdo do PDF no caminho: ${filePath}`);
        try {
            const pdfBuffer = fs.readFileSync(filePath);
            const pdfData = await pdfParse(pdfBuffer);
            const text = pdfData.text; // Conteúdo do PDF em texto

            this.logger.log(`Texto extraído do PDF:\n${text.slice(0, 200)}...`); // Mostra os primeiros 500 caracteres do texto
            if (text.includes(searchText)) {
                this.logger.log('Texto esperado encontrado no PDF.');
                return;
            }

            this.logger.warn('Texto esperado não encontrado no PDF. Excluindo arquivo...');
            fs.unlinkSync(filePath);
            throw new BadRequestException('O PDF não contém o texto esperado.');
        } catch (error) {
            this.logger.error(`Erro ao validar o PDF: ${error.message}`);
            throw new BadRequestException('Erro ao validar o PDF.', error.message);
        }
    }
}
