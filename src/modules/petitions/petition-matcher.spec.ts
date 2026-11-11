import { compareNames, decideAction, findPetitionMatches, isUsableName, nameTokens } from './petition-matcher';

describe('petition-matcher', () => {
    describe('nameTokens', () => {
        it('ignora acento, caixa e partículas', () => {
            expect(nameTokens('  JOSÉ da Silva  e Souza ')).toEqual(['jose', 'silva', 'souza']);
        });
    });

    describe('isUsableName', () => {
        it('recusa vazio, nome único e falha do OCR', () => {
            expect(isUsableName('')).toBe(false);
            expect(isUsableName('Maria')).toBe(false);
            expect(isUsableName('nome não localizado')).toBe(false);
            expect(isUsableName('Maria Souza')).toBe(true);
        });
    });

    describe('compareNames', () => {
        it('exact: mesmo nome com ou sem partícula/acento', () => {
            expect(compareNames('Kauan Lima Andrade', 'Kauan Lima de Andrade')).toBe('exact');
            expect(compareNames('JOSÉ SILVA', 'jose silva')).toBe('exact');
        });
        it('likely: OCR cortou o sobrenome (caso real da Giovana)', () => {
            expect(compareNames('Giovana Costa Lima', 'Giovana Costa Lima de Andrade')).toBe('likely');
        });
        it('similar: uma palavra lida errada mas mesmo começo', () => {
            expect(compareNames('Marcela Nery Souza Bandeira', 'Marcela Nery de Sousa Bandeira')).toBe('similar');
        });
        it('null: pessoas diferentes', () => {
            expect(compareNames('Kauan Lima de Andrade', 'Giovana Costa Lima de Andrade')).toBeNull();
            expect(compareNames('Maria Silva', 'João Silva')).toBeNull();
            expect(compareNames('Maria', 'Maria Silva')).toBeNull();
        });
    });

    describe('findPetitionMatches + decideAction', () => {
        const base = [
            {
                id: 'a',
                name: 'Kauan Lima de Andrade',
                status: 'ACTIVE',
                participants: [{ name: 'Kauan Lima de Andrade', congregation: { name: 'Ceagesp' }, participantsGroup: [{ group: { name: 'UPA GENERAL CARNEIRO' } }] }],
            },
            { id: 'b', name: 'Giovana Costa Lima', status: 'EXCLUDED', participants: [] },
            { id: 'c', name: 'Giovana Costa Lima de Andrade', status: 'ACTIVE', participants: [{ name: 'Giovana Costa Lima de Andrade' }] },
            { id: 'd', name: 'Darlan de Oliveira Meneses', status: 'ACTIVE', participants: [] },
        ];

        it('atualização: um cadastro ativo bate -> update (com dados para a tela mostrar)', () => {
            const m = findPetitionMatches('Kauan Lima Andrade', base);
            expect(m.map((x) => x.id)).toEqual(['a']);
            expect(m[0].congregation).toBe('Ceagesp');
            expect(m[0].groups).toEqual(['UPA GENERAL CARNEIRO']);
            expect(decideAction(m)).toBe('update');
        });

        it('ativa vem antes da excluída e, com 1 ativa forte, ainda é update', () => {
            const m = findPetitionMatches('Giovana Costa Lima', base);
            expect(m.map((x) => x.id)).toEqual(['c', 'b']);
            expect(m[0].status).toBe('ACTIVE');
            expect(decideAction(m)).toBe('update');
        });

        it('pessoa nova: ninguém parecido -> new', () => {
            const m = findPetitionMatches('Roberta Alves Pinto', base);
            expect(m).toEqual([]);
            expect(decideAction(m)).toBe('new');
        });

        it('só excluída bate -> review (a pessoa decide)', () => {
            const m = findPetitionMatches('Darlan Meneses Silva', [{ id: 'x', name: 'Darlan Meneses Silva', status: 'EXCLUDED', participants: [] }]);
            expect(decideAction(m)).toBe('review');
        });

        it('duas ativas parecidas -> review', () => {
            const m = findPetitionMatches('Ana Paula Souza', [
                { id: '1', name: 'Ana Paula Souza', status: 'ACTIVE', participants: [] },
                { id: '2', name: 'Ana Paula Souza Lima', status: 'ACTIVE', participants: [] },
            ]);
            expect(m).toHaveLength(2);
            expect(decideAction(m)).toBe('review');
        });

        it('nome ilegível não casa com ninguém', () => {
            expect(findPetitionMatches('nome não localizado', base)).toEqual([]);
        });

        it('casa pelo nome do participante vinculado quando o nome da petição saiu torto', () => {
            const m = findPetitionMatches('Cintia Dellen Santos Meneses', [
                { id: 'z', name: 'Cintia Dellen', status: 'ACTIVE', participants: [{ name: 'Cintia Dellen dos Santos Meneses' }] },
            ]);
            expect(m.map((x) => x.id)).toEqual(['z']);
            expect(decideAction(m)).toBe('update');
        });
    });
});
