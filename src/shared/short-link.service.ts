import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { PrismaService } from 'src/infra/prisma/prisma.service';

/**
 * Port 1:1 de `api/src/services/ShortLinkService.ts`.
 *
 * A tabela `short_links` é a mesma nos dois projetos (banho Neon compartilhado) e
 * o redactor (`GET /s/{code}`, em `api/sls-shortener.yml`) continua na legacy,
 * então o formato do código precisa ser idêntico: 4 caracteres hex de 3 bytes.
 *
 * O cron que limpa links velhos (`cleanupShortLinks`) também continua na legacy.
 */
@Injectable()
export class ShortLinkService {
  private readonly logger = new Logger(ShortLinkService.name);

  constructor(private readonly prisma: PrismaService) {}

  private generateId(): string {
    return randomBytes(3).toString('hex').substring(0, 4);
  }

  async shorten(originalUrl: string): Promise<string> {
    const domain = process.env.SHORT_LINK_DOMAIN || 'https://go.tpedigital.com.br';
    let code = this.generateId();

    // 4 caracteres hex = 16^4 = 65.536 combinações; a colisão é comum e o
    // `while` abaixo é o que garante unicidade (mesma estratégia da legacy).
    let attempts = 0;
    while (await this.prisma.shortLink.findUnique({ where: { code } })) {
      code = this.generateId();
      if (++attempts > 50) {
        throw new Error('Não foi possível gerar um código de link único');
      }
    }

    await this.prisma.shortLink.create({ data: { code, originalUrl } });

    return `${domain}/s/${code}`;
  }
}
