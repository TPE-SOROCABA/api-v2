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
        
        // Debug detalhado da requisição
        this.logger.debug(`🔍 [REQ DEBUG] URL: ${req.url} | Path: ${req.path} | OriginalUrl: ${req.originalUrl} | Method: ${req.method}`);
        
        // Usar originalUrl como fallback se path estiver vazio ou for apenas '/'
        const actualPath = req.path && req.path !== '/' ? req.path : req.originalUrl;
        this.logger.debug(`🎯 [PATH RESOLVED] Using path: ${actualPath} (original path: ${req.path})`);
        
        const isDbRoute = this.isDbRoute(actualPath);
        const timeSinceLastCheck = now - this.lastCheck;

        this.logger.debug(`📍 Path: ${actualPath} | Usa DB: ${isDbRoute} | Tempo desde última verificação: ${timeSinceLastCheck}ms`);

        // Só verifica conexão se não foi verificada recentemente
        // E apenas para rotas que provavelmente usarão o banco
        const shouldCheck = timeSinceLastCheck > this.CHECK_INTERVAL && isDbRoute;

        if (shouldCheck) {
            this.logger.debug(`🔄 Iniciando verificação de conexão para ${actualPath}`);
        } else if (!isDbRoute) {
            this.logger.debug(`⚡ Rota ${actualPath} não usa banco - Passando direto`);
        } else {
            this.logger.debug(`⏭️ Rota ${actualPath} usa banco, mas verificação recente (${timeSinceLastCheck}ms) - Passando`);
        }

        if (shouldCheck) {
            this.lastCheck = now;

            if (!this.prisma.isConnected) {
                this.logger.log(`🔍 Rota ${actualPath} precisa do banco - Neon está hibernando, preparando despertar...`);

                try {
                    const connected = await this.prisma.connectToDatabase();
                    if (connected) {
                        this.logger.log(`✅ Neon despertado para rota ${actualPath} - Pronto para processar`);
                    } else {
                        this.logger.warn(`⚠️ Neon não despertou completamente para ${actualPath} - tentativas esgotadas`);
                    }
                } catch (error) {
                    this.logger.warn(`⚠️ Falha ao despertar Neon para ${actualPath}: ${error.message}`);
                    // Não bloqueia a requisição - deixa o Prisma lidar com isso
                }
            } else {
                this.logger.debug(`✅ Neon já ativo para rota ${actualPath} - Processando diretamente`);
            }
        }

        next();
    }

    private isDbRoute(path: string): boolean {
        // Lista de rotas que NÃO usam o banco de dados
        const nonDbRoutes = ['/health-check'];

        // Se a rota está na lista de rotas sem banco, retorna false
        const isNonDbRoute = nonDbRoutes.some(route => path.startsWith(route));

        if (isNonDbRoute) {
            this.logger.debug(`🚫 Rota ${path} identificada como não-DB (match: ${nonDbRoutes.find(route => path.startsWith(route))})`);
            return false;
        }

        // Todas as outras rotas usam banco por padrão
        this.logger.debug(`✅ Rota ${path} identificada como DB (não está na lista de exceções)`);
        return true;
    }
}
