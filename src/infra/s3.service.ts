import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid'; // Para gerar nomes únicos
import { TransactionLogger } from './transaction.logger';

@Injectable()
export class S3Service {
  private readonly s3: S3Client;
  private readonly logger = new TransactionLogger(S3Service.name);

  constructor() {
    this.logger.log('Inicializando cliente S3...');
    this.s3 = new S3Client({
      region: 'us-east-1', // Ajuste para a sua região
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    this.logger.log('Cliente S3 inicializado com sucesso.');
  }

  async uploadFile(file: Express.Multer.File, bucketName: string): Promise<string> {
    this.logger.log(`Iniciando upload do arquivo: ${file.originalname} para o bucket: ${bucketName}`);

    // Verifica se o bucket existe
    const bucketExists = await this.bucketExists(bucketName);
    if (!bucketExists) {
      this.logger.warn(`Bucket "${bucketName}" não encontrado. Criando um novo bucket...`);
      await this.createBucket(bucketName);
      this.logger.log(`Bucket "${bucketName}" criado com sucesso.`);
    } else {
      this.logger.log(`Bucket "${bucketName}" encontrado.`);
    }

    // Gera um nome único para o arquivo
    const extension = file.originalname.split('.').pop();
    const fileKey = `${uuidv4()}.${extension}`;
    this.logger.log(`Chave gerada para o arquivo: ${fileKey}`);

    // Faz o upload do arquivo para o S3
    this.uploadFileWithRetry(bucketName, fileKey, file);

    const fileUrl = `${process.env.CLOUDFRONT_PETITION_URL}/${fileKey}`;
    this.logger.log(`URL pública gerada para o arquivo: ${fileUrl}`);
    return fileUrl;
  }

  private async uploadFileWithRetry(bucketName: string, fileKey: string, file: Express.Multer.File) {
    const maxRetries = 3;
    let attempt = 0;

    const uploadToS3 = async (): Promise<boolean> => {
      try {
        this.logger.log('Iniciando envio do arquivo para o S3...');
        await this.s3.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: fileKey,
          Body: file.buffer,
          ContentType: file.mimetype,
          ACL: 'public-read',
        }));
        this.logger.log(`Arquivo "${file.originalname}" enviado com sucesso para o S3.`);
        return true;
      } catch (error) {
        this.logger.error(`Erro ao fazer upload do arquivo para o S3: ${error.message}`);
        return false;
      }
    };

    while (attempt < maxRetries) {
      const success = await uploadToS3();
      if (success) return;

      attempt++;
      if (attempt < maxRetries) {
        this.logger.log(`Tentativa ${attempt} falhou. Tentando novamente...`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Aguarda 2 segundos antes de tentar novamente
      }
    }

    this.logger.error('Falha ao enviar o arquivo para o S3 após 3 tentativas.');
  }

  async deleteFile(fileKey: string, bucketName: string): Promise<void> {
    this.logger.log(`Iniciando exclusão do arquivo: ${fileKey} do bucket: ${bucketName}`);

    // Verifica se o bucket existe
    const bucketExists = await this.bucketExists(bucketName);
    if (!bucketExists) {
      this.logger.warn(`Bucket "${bucketName}" não encontrado.`);
      return;
    }

    // Exclui o arquivo do S3
    try {
      this.logger.log('Iniciando exclusão do arquivo do S3...');
      await this.s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: fileKey }));
      this.logger.log(`Arquivo "${fileKey}" excluído com sucesso do S3.`);
    } catch (error) {
      this.logger.error(`Erro ao excluir o arquivo do S3: ${error.message}`);
      throw new InternalServerErrorException('Erro ao excluir o arquivo', error.message);
    }
  }

  // Verificar se o bucket existe
  private async bucketExists(bucketName: string): Promise<boolean> {
    this.logger.log(`Verificando existência do bucket: ${bucketName}`);
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: bucketName }));
      this.logger.log(`Bucket "${bucketName}" existe.`);
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        this.logger.warn(`Bucket "${bucketName}" não encontrado.`);
        return false;
      }
      this.logger.error(`Erro ao verificar o bucket "${bucketName}": ${error.message}`);
      throw new InternalServerErrorException('Erro ao verificar o bucket', error.message);
    }
  }

  // Criar bucket com permissões públicas
  private async createBucket(bucketName: string): Promise<void> {
    this.logger.log(`Criando bucket: ${bucketName}...`);
    try {
      await this.s3.send(new CreateBucketCommand({ Bucket: bucketName }));
      this.logger.log(`Bucket "${bucketName}" criado com sucesso.`);
    } catch (error) {
      this.logger.error(`Erro ao criar o bucket "${bucketName}": ${error.message}`);
      throw new InternalServerErrorException('Erro ao criar o bucket com permissões públicas', error.message);
    }
  }
}
