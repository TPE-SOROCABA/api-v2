import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { PetitionsService } from './petitions.service';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('PetitionsService.checkFileHash', () => {
    let dir: string;
    let file: Express.Multer.File;
    let hash: string;
    let prisma: any;
    let service: PetitionsService;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-'));
        const content = Buffer.from('pdf-de-teste-' + Math.random());
        hash = sha(content);
        const filePath = path.join(dir, 'a.pdf');
        await fs.writeFile(filePath, content);
        file = { path: filePath, originalname: 'a.pdf' } as Express.Multer.File;
        prisma = { petitions: { findFirst: jest.fn(), update: jest.fn() } };
        service = new PetitionsService(null as any, prisma, null as any, null as any);
    });

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('sem petição com o hash: segue e devolve o hash', async () => {
        prisma.petitions.findFirst.mockResolvedValue(null);
        await expect(service.checkFileHash(file)).resolves.toBe(hash);
        expect(prisma.petitions.update).not.toHaveBeenCalled();
    });

    it('hash de petição EXCLUIDA nao bloqueia e libera o hash dela (coluna e unica)', async () => {
        prisma.petitions.findFirst.mockResolvedValue({ id: 'ex1', name: 'Kauan Lima Andrade', status: 'EXCLUDED' });
        await expect(service.checkFileHash(file, 'ativa1')).resolves.toBe(hash);
        expect(prisma.petitions.update).toHaveBeenCalledWith({
            where: { id: 'ex1' },
            data: { hash: `${hash}-excluida-ex1` },
        });
        await expect(fs.stat(file.path)).resolves.toBeTruthy(); // PDF segue para o envio
    });

    it('hash de outra petição ATIVA continua bloqueando (e apaga o PDF temporário)', async () => {
        prisma.petitions.findFirst.mockResolvedValue({ id: 'o1', name: 'Giovana Costa Lima de Andrade', status: 'ACTIVE' });
        await expect(service.checkFileHash(file)).rejects.toThrow('Petição já existe nome: Giovana Costa Lima de Andrade');
        await expect(fs.stat(file.path)).rejects.toBeTruthy();
    });

    it('na atualização, PDF igual ao da própria petição dá mensagem clara', async () => {
        prisma.petitions.findFirst.mockResolvedValue({ id: 'p1', name: 'Kauan Lima de Andrade', status: 'ACTIVE' });
        await expect(service.checkFileHash(file, 'p1')).rejects.toThrow(/igual ao que já está nesta petição/);
    });
});

describe('PetitionsService.analyzeFile', () => {
    let dir: string;
    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-'));
    });
    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true });
    });

    it('PDF idêntico a petição ativa => duplicate, sem converter nem OCR', async () => {
        const filePath = path.join(dir, 'b.pdf');
        await fs.writeFile(filePath, 'x');
        const prisma: any = {
            petitions: {
                findFirst: jest.fn().mockResolvedValue({ id: 'p', name: 'Fulano de Tal', status: 'ACTIVE', protocol: '1' }),
                findMany: jest.fn(),
            },
        };
        const convert: any = { extractFirstPage: jest.fn() };
        const service = new PetitionsService(convert, prisma, null as any, null as any);
        const r = await service.analyzeFile({ path: filePath } as Express.Multer.File);
        expect(r.action).toBe('duplicate');
        expect(convert.extractFirstPage).not.toHaveBeenCalled();
        await expect(fs.stat(filePath)).rejects.toBeTruthy(); // temporário limpo
    });

    it('nome lido casa com cadastro ativo => update e limpa os temporários', async () => {
        const filePath = path.join(dir, 'c.pdf');
        const imgPath = path.join(dir, 'c.png');
        await fs.writeFile(filePath, 'y');
        await fs.writeFile(imgPath, 'img');
        const prisma: any = {
            petitions: {
                findFirst: jest.fn().mockResolvedValue(null),
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'a',
                        name: 'Kauan Lima de Andrade',
                        status: 'ACTIVE',
                        participants: [{ name: 'Kauan Lima de Andrade', congregation: { name: 'Ceagesp' }, participantsGroup: [] }],
                    },
                ]),
            },
        };
        const convert: any = { extractFirstPage: jest.fn().mockResolvedValue(imgPath) };
        const ocr: any = { processImage: jest.fn().mockResolvedValue('Kauan Lima Andrade') };
        const service = new PetitionsService(convert, prisma, ocr, null as any);
        const r = await service.analyzeFile({ path: filePath } as Express.Multer.File);
        expect(r.action).toBe('update');
        expect(r.extractedName).toBe('Kauan Lima Andrade');
        expect(r.matches[0].id).toBe('a');
        await expect(fs.stat(filePath)).rejects.toBeTruthy();
        await expect(fs.stat(imgPath)).rejects.toBeTruthy();
    });

    it('OCR falhou => nameReadable false, action new e nem consulta o cadastro', async () => {
        const filePath = path.join(dir, 'd.pdf');
        await fs.writeFile(filePath, 'z');
        const prisma: any = { petitions: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn() } };
        const convert: any = { extractFirstPage: jest.fn().mockResolvedValue(path.join(dir, 'nao-existe.png')) };
        const ocr: any = { processImage: jest.fn().mockResolvedValue('nome não localizado') };
        const service = new PetitionsService(convert, prisma, ocr, null as any);
        const r = await service.analyzeFile({ path: filePath } as Express.Multer.File);
        expect(r.nameReadable).toBe(false);
        expect(r.action).toBe('new');
        expect(prisma.petitions.findMany).not.toHaveBeenCalled();
    });
});
