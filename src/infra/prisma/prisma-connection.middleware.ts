import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaConnectionMiddleware implements NestMiddleware {
    private logger = new Logger(PrismaConnectionMiddleware.name);
    private lastCheck = 0;
    private readonly CHECK_INTERVAL = 30000; // Verifica a cada 30 segundos no máximo

    constructor(private readonly prisma: PrismaService) { }

    async use(req: Request, res: Response, next: NextFunction) {
        const now = Date.now();

        // Só verifica conexão se não foi verificada recentemente
        // E apenas para rotas que provavelmente usarão o banco
        const shouldCheck = (now - this.lastCheck) > this.CHECK_INTERVAL &&
            this.isDbRoute(req.path);

        if (shouldCheck) {
            this.lastCheck = now;

            if (!this.prisma.isConnected) {
                this.logger.log(`🔍 Rota ${req.path} precisa do banco - Neon está hibernando, preparando despertar...`);

                try {
                    const connected = await this.prisma.connectToDatabase();
                    if (connected) {
                        this.logger.log(`✅ Neon despertado para rota ${req.path} - Pronto para processar`);
                    } else {
                        this.logger.warn(`⚠️ Neon não despertou completamente para ${req.path} - tentativas esgotadas`);
                    }
                } catch (error) {
                    this.logger.warn(`⚠️ Falha ao despertar Neon para ${req.path}: ${error.message}`);
                    // Não bloqueia a requisição - deixa o Prisma lidar com isso
                }
            } else {
                this.logger.debug(`✅ Neon já ativo para rota ${req.path} - Processando diretamente`);
            }
        }

        next();
    }

    private isDbRoute(path: string): boolean {
        // Lista de rotas que provavelmente usarão o banco
        const dbRoutes = ['/participants', '/petitions', '/congregations', '/groups', '/dashboard'];
        return dbRoutes.some(route => path.startsWith(route)) || path === '/';
    }
}
