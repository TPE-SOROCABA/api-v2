import { PrismaClient } from '@prisma/client';
import { Logger, Injectable } from '@nestjs/common';

@Injectable()
export class PrismaService extends PrismaClient {
  private logger = new Logger(PrismaService.name);
  public isConnected = false;
  private reconnecting = false;

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
    });

    this.$on('connect' as never, () => {
      this.isConnected = true;
      this.reconnecting = false;
      this.logger.log('🔌 Neon ATIVO - Conexão estabelecida e pronta para consultas');
    });

    this.$on('disconnect' as never, () => {
      this.isConnected = false;
      this.logger.log('💤 Neon HIBERNANDO - Desconectado para economizar recursos (comportamento normal)');
    });

    this.$on('error' as never, (error: any) => {
      this.isConnected = false;
      // Filtra erros de conexão fechada do Neon (comportamento esperado)
      if (error?.message?.includes('Closed') || error?.kind === 'Closed') {
        this.logger.log('🛌 Neon entrou em HIBERNAÇÃO - Próxima requisição irá despertá-lo automaticamente');
      } else {
        this.logger.error(`🔥 Erro real no Neon (NÃO é hibernação): `, error);
      }
    });

    // Remove o listener do process.beforeExit para evitar logs desnecessários
  }

  // Método helper para garantir conexão antes de operações críticas
  async ensureConnection(): Promise<void> {
    if (!this.isConnected) {
      const connected = await this.connectToDatabase();
      if (!connected) {
        throw new Error('Não foi possível estabelecer conexão com o banco de dados');
      }
    }
    this.logger.log('✅ Conexão com o banco garantida para operação crítica');
  }

  // Verifica status SEM acordar o banco - apenas para health check
  getConnectionStatus(): { connected: boolean; status: string; lastActivity?: Date } {
    const status = this.isConnected ? 'ATIVO' : 'HIBERNANDO';

    if (this.isConnected) {
      this.logger.log(`📊 Status Neon: ${status} - Banco pronto para consultas`);
    } else {
      this.logger.log(`💤 Status Neon: ${status} - Banco dormindo (economia de recursos)`);
    }

    return {
      connected: this.isConnected,
      status,
      lastActivity: this.isConnected ? new Date() : undefined
    };
  }

  // Override com logs de hibernação mais claros
  async connectToDatabase(): Promise<boolean> {
    if (this.isConnected || this.reconnecting) return this.isConnected;

    this.logger.log(`🌅 Neon estava hibernando - iniciando processo de despertar...`);
    this.reconnecting = true;
    let retries = 3;

    while (retries > 0) {
      try {
        await this.$connect();
        // Força a atualização do estado se $connect() sucedeu mas o evento não foi disparado
        this.isConnected = true;
        this.reconnecting = false;
        this.logger.log('✅ Neon despertou com sucesso! Banco ativo e pronto.');

        // Testa a conexão com uma query simples
        await this.$queryRaw`SELECT 1 as test`;
        this.logger.debug('🔍 Teste de conexão confirmado - Neon totalmente funcional');
        return true;
      } catch (error) {
        const attempt = 4 - retries;
        this.logger.warn(`⏳ Tentativa ${attempt}/3 de despertar o Neon: ${error.message}`);
        retries--;

        if (retries > 0) {
          await new Promise((res) => setTimeout(res, attempt * 1000));
        }
      }
    }

    this.reconnecting = false;
    this.logger.error('❌ Falha ao despertar o Neon após 3 tentativas - pode estar com problemas');
    return false;
  }

  async onModuleInit() {
    await this.connectToDatabase();
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.isConnected = false;
      this.logger.log('🔌 Conexão com o banco encerrada graciosamente.');
    } catch (error) {
      // Ignora erros de desconexão no shutdown
      this.logger.debug('Desconexão silenciosa durante shutdown.');
    }
  }
}
