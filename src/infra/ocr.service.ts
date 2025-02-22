import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { join } from 'path';
import { TransactionLogger } from './transaction.logger';

@Injectable()
export class OcrService {
    logger = new TransactionLogger(OcrService.name);
    async processImage(imagePath: string): Promise<string> {
        this.logger.log(`Iniciando processamento da imagem: ${imagePath}`);
        return new Promise((resolve) => {
            const scriptPath = join(__dirname, '..', '..', 'ocr_extractor.py');
            exec(`python3 ${scriptPath} ${imagePath}`, (error, stdout, stderr) => {
                if (error) {
                    this.logger.error(`Erro ao executar OCR: ${stderr}`);
                    resolve('nome não localizado');
                    return;
                }
                this.logger.log(`Processamento concluído com sucesso: ${stdout}`);
                resolve(stdout);
            });
        });
    }
}

