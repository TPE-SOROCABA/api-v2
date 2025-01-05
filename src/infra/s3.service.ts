import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand, PutBucketAclCommand, PutBucketPolicyCommand, AccessControlPolicy, ObjectOwnership, BucketCannedACL, DeleteBucketCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid'; // Para gerar nomes únicos

@Injectable()
export class S3Service {
  private s3: S3Client;

  constructor() {
    this.s3 = new S3Client({
      region: 'us-east-1', // Ajuste para a sua região
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  async uploadFile(file: Express.Multer.File, bucketName: string): Promise<string> {
    const bucketExists = await this.bucketExists(bucketName);
    if (!bucketExists) {
      await this.createBucket(bucketName);
    }

    const fileKey = `${uuidv4()}-${file.originalname}`;

    await this.s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'public-read',
    }));

    return `${process.env.CLOUDFRONT_PETITION_URL}/${fileKey}`;
  }

  // Verificar se o bucket existe
  private async bucketExists(bucketName: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: bucketName }));
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw new InternalServerErrorException('Erro ao verificar o bucket', error.message);
    }
  }

  private async createBucket(bucketName: string): Promise<void> {
    try {
      await this.s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    } catch (error) {
      throw new InternalServerErrorException('Erro ao criar o bucket com permissões públicas', error.message);
    }
  }
}
