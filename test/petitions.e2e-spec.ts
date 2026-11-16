/**
 * E2E das petições: API real (controller + multer + service + Prisma) contra o banco de HMG.
 *
 * Só o que não existe em qualquer máquina fica simulado: conversão do PDF em imagem
 * (GraphicsMagick), OCR (Tesseract) e Firebase. Todo dado criado tem o prefixo ZZTESTE
 * e é apagado no fim. NUNCA aponte o DATABASE_URL para produção.
 *
 * Rodar: npx jest --config ./test/jest-e2e.json petitions
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as request from 'supertest';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { OcrService } from 'src/infra/ocr.service';
import { FirebaseService } from 'src/infra/firebase.service';
import { ConvertPdfToImagesUseCase } from 'src/modules/petitions/convert-pdf-to-images.usecase';
import { PetitionsController } from 'src/modules/petitions/petitions.controller';
import { PetitionsService } from 'src/modules/petitions/petitions.service';

const RUN = `ZZTESTE${Date.now().toString().slice(-6)}`;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const pdf = (tag: string) => Buffer.from(`%PDF-1.4 ${RUN} ${tag} ${Math.random()}`);
const protocol = () => String(Math.floor(Math.random() * 9e11) + 1e11);

describe('Petições (e2e, banco HMG)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let tmp: string;
    let ocrName = `${RUN} Pessoa Padrao`;
    const created: string[] = [];

    const uploadsDir = path.join(process.cwd(), 'uploads');
    const listUploads = async () => (await fs.readdir(uploadsDir).catch(() => [])).sort();

    const seed = async (data: { name: string; status?: any; hash: string }) => {
        const p = await prisma.petitions.create({
            data: {
                name: data.name,
                protocol: protocol(),
                publicUrl: `https://fake.test/old-public-${data.hash.slice(0, 6)}.png`,
                privateUrl: `https://fake.test/old-private-${data.hash.slice(0, 6)}.png`,
                hash: data.hash,
                status: data.status ?? 'ACTIVE',
            },
        });
        created.push(p.id);
        return p;
    };

    beforeAll(async () => {
        tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-e2e-'));
        await fs.mkdir(uploadsDir, { recursive: true });

        const fakeConvert = {
            execute: async (pdfPath: string) => {
                const a = path.join(tmp, `${Math.random()}.png`);
                const b = path.join(tmp, `${Math.random()}.png`);
                await fs.writeFile(a, 'img1');
                await fs.writeFile(b, 'img2');
                await fs.unlink(pdfPath).catch(() => null); // igual ao use case real
                return [a, b];
            },
            extractFirstPage: async () => {
                const a = path.join(tmp, `${Math.random()}-p1.png`);
                await fs.writeFile(a, 'img1');
                return a;
            },
        };
        const fakeOcr = { processImage: async () => ocrName };
        const fakeFirebase = {
            uploadFile: async (_f: any, key: string) => `https://fake.test/new/${key}`,
            deleteFileByUrl: async () => undefined,
        };

        const mod = await Test.createTestingModule({
            controllers: [PetitionsController],
            providers: [
                PetitionsService,
                PrismaService,
                { provide: ConvertPdfToImagesUseCase, useValue: fakeConvert },
                { provide: OcrService, useValue: fakeOcr },
                { provide: FirebaseService, useValue: fakeFirebase },
            ],
        }).compile();
        app = mod.createNestApplication();
        await app.init();
        prisma = mod.get(PrismaService);
    }, 60000);

    afterAll(async () => {
        await prisma.petitions.deleteMany({ where: { OR: [{ id: { in: created } }, { name: { startsWith: RUN } }] } });
        await app.close();
        await fs.rm(tmp, { recursive: true, force: true });
    }, 60000);

    const attach = (req: request.Test, content: Buffer, name = 'peticao.pdf', type = 'application/pdf') =>
        req.attach('file', content, { filename: name, contentType: type });

    describe('caso real do Kauan: excluída duplicada com o mesmo PDF bloqueava a atualização', () => {
        const NOVO = pdf('kauan-2026');
        let ativa: { id: string };
        let excluida: { id: string };

        it('PUT atualiza a petição ativa mesmo havendo uma EXCLUÍDA com o mesmo PDF', async () => {
            ativa = await seed({ name: `${RUN} Kauan Lima de Andrade`, hash: sha(pdf('antigo-2024')) });
            excluida = await seed({ name: `${RUN} Kauan Lima Andrade`, status: 'EXCLUDED', hash: sha(NOVO) });

            const res = await attach(request(app.getHttpServer()).put(`/petitions/upload/${ativa.id}`), NOVO);
            expect(res.status).toBe(200);

            const a = await prisma.petitions.findUnique({ where: { id: ativa.id } });
            const e = await prisma.petitions.findUnique({ where: { id: excluida.id } });
            expect(a!.hash).toBe(sha(NOVO));
            expect(a!.publicUrl).toContain('https://fake.test/new/');
            expect(e!.hash).toBe(`${sha(NOVO)}-excluida-${excluida.id}`); // hash liberado
            expect(e!.status).toBe('EXCLUDED'); // continua excluída, nada foi apagado
        });

        it('repetir o mesmo PDF na mesma petição dá mensagem clara (409)', async () => {
            const res = await attach(request(app.getHttpServer()).put(`/petitions/upload/${ativa.id}`), NOVO);
            expect(res.status).toBe(409);
            expect(res.body.message).toMatch(/igual ao que já está nesta petição/);
        });

        it('enviar esse PDF como petição nova continua bloqueado (já existe numa ATIVA)', async () => {
            const res = await attach(request(app.getHttpServer()).post('/petitions/upload'), NOVO);
            expect(res.status).toBe(409);
            expect(res.body.message).toBe(`Petição já existe nome: ${RUN} Kauan Lima de Andrade`);
        });
    });

    describe('envio de petição nova quando uma EXCLUÍDA tem o mesmo PDF (antes dava erro de hash único)', () => {
        it('POST cria a petição nova e libera o hash da excluída', async () => {
            const CONTEUDO = pdf('volta');
            const ex = await seed({ name: `${RUN} Fulana Antiga`, status: 'EXCLUDED', hash: sha(CONTEUDO) });
            ocrName = `${RUN} Fulana Antiga`;

            const res = await attach(request(app.getHttpServer()).post('/petitions/upload'), CONTEUDO);
            expect(res.status).toBe(201);
            created.push(res.body.id);

            const nova = await prisma.petitions.findUnique({ where: { id: res.body.id } });
            const antiga = await prisma.petitions.findUnique({ where: { id: ex.id } });
            expect(nova!.hash).toBe(sha(CONTEUDO));
            expect(antiga!.hash).toBe(`${sha(CONTEUDO)}-excluida-${ex.id}`);
            expect(antiga!.status).toBe('EXCLUDED');
        });
    });

    describe('análise antes do envio (atualização ou pessoa nova)', () => {
        let alvo: { id: string };
        let excluidaAlvo: { id: string };

        beforeAll(async () => {
            alvo = await seed({ name: `${RUN} Giovana Costa Lima de Andrade`, hash: sha(pdf('giovana-base')) });
            excluidaAlvo = await seed({ name: `${RUN} Giovana Costa Lima`, status: 'EXCLUDED', hash: sha(pdf('giovana-ex')) });
        });

        const contarPeticoes = () => prisma.petitions.count({ where: { name: { startsWith: RUN } } });

        it('nome cortado pelo OCR casa com o cadastro ativo => update (a ativa vem antes da excluída)', async () => {
            ocrName = `${RUN} Giovana Costa Lima`;
            const antes = await contarPeticoes();
            const res = await attach(request(app.getHttpServer()).post('/petitions/upload/analyze'), pdf('giovana-2026'));
            expect(res.status).toBe(201);
            expect(res.body.action).toBe('update');
            expect(res.body.nameReadable).toBe(true);
            // HMG tem cópia de dados reais: podem aparecer outras excluídas parecidas além das do teste
            const ids = res.body.matches.map((m: any) => m.id);
            expect(ids[0]).toBe(alvo.id);
            expect(ids).toContain(excluidaAlvo.id);
            const status = res.body.matches.map((m: any) => m.status);
            expect(status.indexOf('EXCLUDED')).toBeGreaterThan(status.lastIndexOf('ACTIVE')); // ativas antes das excluídas
            expect(await contarPeticoes()).toBe(antes); // análise não grava nada
        });

        it('nome que ninguém tem => new', async () => {
            ocrName = `${RUN} Roberta Alves Pinto`;
            const res = await attach(request(app.getHttpServer()).post('/petitions/upload/analyze'), pdf('nova-pessoa'));
            expect(res.body.action).toBe('new');
            expect(res.body.matches).toEqual([]);
        });

        it('PDF idêntico a petição ativa => duplicate', async () => {
            const IGUAL = pdf('ja-existe');
            const p = await seed({ name: `${RUN} Pessoa Do Pdf Igual`, hash: sha(IGUAL) });
            const res = await attach(request(app.getHttpServer()).post('/petitions/upload/analyze'), IGUAL);
            expect(res.body.action).toBe('duplicate');
            expect(res.body.duplicateOf.id).toBe(p.id);
        });

        it('PDF igual ao de uma EXCLUÍDA não é duplicado (pode seguir)', async () => {
            const IGUAL = pdf('so-excluida');
            await seed({ name: `${RUN} Pessoa So Excluida`, status: 'EXCLUDED', hash: sha(IGUAL) });
            ocrName = `${RUN} Alguem Totalmente Diferente`;
            const res = await attach(request(app.getHttpServer()).post('/petitions/upload/analyze'), IGUAL);
            expect(res.body.action).toBe('new');
        });

        it('OCR sem nome legível => nameReadable false e nada de sugestão de cadastro', async () => {
            ocrName = 'nome não localizado';
            const res = await attach(request(app.getHttpServer()).post('/petitions/upload/analyze'), pdf('ilegivel'));
            expect(res.body.nameReadable).toBe(false);
            expect(res.body.action).toBe('new');
            expect(res.body.matches).toEqual([]);
        });
    });

    describe('segurança e limpeza', () => {
        it('arquivo que não é PDF é recusado (400) em análise e envio', async () => {
            for (const url of ['/petitions/upload/analyze', '/petitions/upload']) {
                const res = await attach(request(app.getHttpServer()).post(url), Buffer.from('oi'), 'a.txt', 'text/plain');
                expect(res.status).toBe(400);
            }
        });

        it('a pasta uploads não acumula PDFs temporários depois das análises e dos envios', async () => {
            const antes = await listUploads();
            ocrName = `${RUN} Qualquer Pessoa Teste`;
            await attach(request(app.getHttpServer()).post('/petitions/upload/analyze'), pdf('limpeza-1'));
            await attach(request(app.getHttpServer()).post('/petitions/upload/analyze'), pdf('limpeza-2'));
            expect(await listUploads()).toEqual(antes);
        });
    });
});
