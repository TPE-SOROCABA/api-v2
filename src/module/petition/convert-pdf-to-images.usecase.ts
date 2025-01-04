import { BadRequestException, Injectable } from '@nestjs/common';
import { fromPath } from 'pdf2pic';
import pdfParse from 'pdf-parse';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ConvertPdfToImagesUseCase {
    async execute(pdfPath: string): Promise<string[]> {
        await this.validatePdf(pdfPath, 'UBLICO ESPECIAL');
        const outputDir = path.join(__dirname, '..', '..', 'output');

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const converter = fromPath(pdfPath, {
            density: 300, // Qualidade da imagem
            width: 2480, // Largura da imagem (A4 - 300 DPI)
            height: 3508, // Altura da imagem (A4 - 300 DPI)
            savePath: outputDir, // Diretório de saída
            format: 'png', // Formato da imagem
        });

        const totalPages = 2; // Alterar para o número de páginas, se necessário
        const images: string[] = [];

        for (let i = 1; i <= totalPages; i++) {
            try {
                const result = await converter(i);
                images.push(result.path);
            } catch (error) {
                console.error('Erro na conversão:', error);
            }
        }

        fs.unlinkSync(pdfPath);
        return images;
    }

    private async validatePdf(filePath: string, searchText: string): Promise<void> {
        const pdfBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(pdfBuffer);
        const text = pdfData.text; // Conteúdo do PDF em texto
        if (text.includes(searchText)) return
        fs.unlinkSync(filePath);
        console.error('Texto do PDF:', text);
        throw new BadRequestException('O PDF não contém o texto esperado.');
    }
}
