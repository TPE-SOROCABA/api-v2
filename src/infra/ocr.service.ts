import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { join } from 'path';
import { TransactionLogger } from './transaction.logger';

export type ImageParameters = {
    x: number;
    y: number;
    width: number;
    height: number;
}

@Injectable()
export class OcrService {
    logger = new TransactionLogger(OcrService.name);
    async processImage(imagePath: string, params: ImageParameters): Promise<string> {
        this.logger.log(`Iniciando processamento da imagem: ${imagePath}`);
        const result = await new Promise<string>((resolve) => {
            const scriptPath = join(__dirname, '..', '..', 'ocr_extractor.py');
            this.logger.debug(`python3 ${scriptPath} ${imagePath} ${params.x} ${params.y} ${params.width} ${params.height}`);
            exec(`python3 ${scriptPath} ${imagePath} ${params.x} ${params.y} ${params.width} ${params.height}`, (error, stdout, stderr) => {
                if (error) {
                    this.logger.error(`Erro ao executar OCR: ${stderr}`);
                    resolve('nome não localizado');
                    return;
                }
                this.logger.log(`Processamento concluído com sucesso: ${stdout}`);
                resolve(stdout);
            });
        });
        return result.replace(/\s/g, ' ').trim();
    }
}

