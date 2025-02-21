import { ExceptionFilter, Catch, ArgumentsHost, ConflictException, BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { Response } from 'express';
import { TranslationEnum } from 'src/enums/translation.enum';

@Catch(PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
    catch(exception: PrismaClientKnownRequestError, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();

        let status = 500; // Default to InternalServerError
        let messages: string[] = []; // Array to store error messages

        try {
            switch (exception.code) {
                case 'P2002': // Violação de restrição única (ex: telefone duplicado)
                    const fields = exception.meta?.target;
                    if (fields && Array.isArray(fields) && fields.length > 0) {
                        const field = fields[0]; // Pegando o primeiro campo violado
                        messages.push(`O campo ${this.translateMessages(field)} deve ser único.`);
                    } else {
                        messages.push('Erro de conflito: dados duplicados.');
                    }
                    status = 409;
                    throw new ConflictException(messages);

                case 'P2003': // Chave estrangeira não encontrada (referência inválida)
                    const foreignKeyField = exception.meta?.field_name;
                    if (foreignKeyField && typeof foreignKeyField === 'string') {
                        messages.push(`A chave estrangeira do campo ${this.translateMessages(foreignKeyField)} não foi encontrada.`);
                    } else {
                        messages.push('Chave estrangeira não encontrada.');
                    }
                    status = 400;
                    break;

                case 'P2004': // Falha de tipo de dados (dados fornecidos não correspondem ao tipo esperado)
                    const fieldTypeError = exception.meta?.field_name;
                    if (fieldTypeError && typeof fieldTypeError === 'string') {
                        messages.push(`O campo ${this.translateMessages(fieldTypeError)} contém um valor inválido.`);
                    } else {
                        messages.push('Os dados fornecidos são inválidos.');
                    }
                    status = 400;
                    break;

                case 'P2005': // Falha ao conectar ao banco de dados
                    messages.push('Erro ao conectar ao banco de dados.');
                    status = 500;
                    break;

                case 'P2025': // Registro não encontrado para atualização ou exclusão
                    const recordNotFoundField = exception.meta?.field_name;
                    if (recordNotFoundField && typeof recordNotFoundField === 'string') {
                        messages.push(`O registro no campo ${this.translateMessages(recordNotFoundField)} não foi encontrado.`);
                    } else {
                        messages.push('Registro não encontrado.');
                    }
                    status = 404;
                    break;

                case 'P2026': // Falha ao realizar a operação no banco de dados
                    messages.push('Erro inesperado ao acessar os dados.');
                    status = 500;
                    break;


                default:
                    messages.push('Erro inesperado ao processar a solicitação.');
                    status = 500;
                    throw new InternalServerErrorException(messages);
            }
        } catch (error) {
            response.status(status).json({
                statusCode: error.response.statusCode,
                error: error.response.error,
                message: this.translateMessages(error.response.message),
            });
        }
    }

    private translateMessages(field: string): string[] {
        return TranslationEnum[field] || field;
    }
}
