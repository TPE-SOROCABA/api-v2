/**
 * Comparação tolerante de nomes para decidir se uma petição enviada é
 * ATUALIZAÇÃO de alguém já cadastrado ou uma PESSOA NOVA.
 *
 * O nome vem do OCR do PDF e costuma sair cortado ou sem partículas
 * ("Giovana Costa Lima" x "Giovana Costa Lima de Andrade",
 *  "Kauan Lima Andrade" x "Kauan Lima de Andrade"). Por isso a comparação
 * ignora acento, caixa e as partículas "de/da/do/das/dos/e".
 */

export type MatchLevel = 'exact' | 'likely' | 'similar';

const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

export function nameTokens(name: string | null | undefined): string[] {
    if (!name) return [];
    return name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/** Resultado do OCR quando falha ("nome não localizado") não deve casar com ninguém. */
export function isUsableName(name: string | null | undefined): boolean {
    const tokens = nameTokens(name);
    if (tokens.length < 2) return false;
    return !/nao localizado/.test(tokens.join(' '));
}

function isSubset(small: string[], big: string[]): boolean {
    const set = new Set(big);
    return small.every((t) => set.has(t));
}

/**
 * Compara dois nomes. Retorna o nível da semelhança ou null se não parecem
 * a mesma pessoa.
 *  - exact:   mesmos nomes (ignorando acento, caixa, partículas e ordem das partículas)
 *  - likely:  um nome contém o outro (OCR cortou ou faltou sobrenome), com pelo menos 2 nomes em comum
 *  - similar: mesmo primeiro nome e maioria dos nomes em comum (provável erro de leitura em 1 palavra)
 */
export function compareNames(a: string | null | undefined, b: string | null | undefined): MatchLevel | null {
    const ta = nameTokens(a);
    const tb = nameTokens(b);
    if (ta.length < 2 || tb.length < 2) return null;

    if (ta.length === tb.length && isSubset(ta, tb)) return 'exact';

    const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    if (isSubset(small, big)) return 'likely';

    if (ta[0] === tb[0]) {
        const setB = new Set(tb);
        const common = ta.filter((t) => setB.has(t)).length;
        const union = new Set([...ta, ...tb]).size;
        if (common >= 2 && common / union >= 0.6) return 'similar';
    }
    return null;
}

const LEVEL_RANK: Record<MatchLevel, number> = { exact: 3, likely: 2, similar: 1 };

export type MatchCandidate = {
    id: string;
    name: string;
    status: string;
    createdAt?: Date;
    updatedAt?: Date;
    participants?: { name: string; congregation?: { name: string } | null; participantsGroup?: { group?: { name: string } | null }[] }[];
};

export type PetitionMatch = {
    id: string;
    name: string;
    status: string;
    level: MatchLevel;
    participantName: string | null;
    congregation: string | null;
    groups: string[];
    createdAt?: Date;
    updatedAt?: Date;
};

/** Procura nas petições existentes (nome da petição e nome dos participantes vinculados). */
export function findPetitionMatches(extractedName: string, candidates: MatchCandidate[]): PetitionMatch[] {
    if (!isUsableName(extractedName)) return [];

    const matches: PetitionMatch[] = [];
    for (const c of candidates) {
        const names = [c.name, ...(c.participants ?? []).map((p) => p.name)];
        let best: MatchLevel | null = null;
        for (const n of names) {
            const level = compareNames(extractedName, n);
            if (level && (!best || LEVEL_RANK[level] > LEVEL_RANK[best])) best = level;
        }
        if (!best) continue;

        const participant = c.participants?.[0];
        matches.push({
            id: c.id,
            name: c.name,
            status: c.status,
            level: best,
            participantName: participant?.name ?? null,
            congregation: participant?.congregation?.name ?? null,
            groups: (participant?.participantsGroup ?? []).map((pg) => pg.group?.name).filter((g): g is string => !!g),
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
        });
    }

    // Cadastros ativos antes dos excluídos; depois o melhor nível; depois o mais recente.
    return matches.sort((x, y) => {
        const ex = x.status === 'EXCLUDED' ? 1 : 0;
        const ey = y.status === 'EXCLUDED' ? 1 : 0;
        if (ex !== ey) return ex - ey;
        if (LEVEL_RANK[y.level] !== LEVEL_RANK[x.level]) return LEVEL_RANK[y.level] - LEVEL_RANK[x.level];
        return (y.createdAt?.getTime() ?? 0) - (x.createdAt?.getTime() ?? 0);
    });
}

export type AnalyzeAction = 'new' | 'update' | 'review';

/**
 * Decide o que sugerir:
 *  - new:    ninguém parecido
 *  - update: um único cadastro NÃO excluído, com nome exato ou contido (likely/exact)
 *  - review: qualquer outro caso (vários parecidos, só excluído, ou só "similar") — a pessoa escolhe
 */
export function decideAction(matches: PetitionMatch[]): AnalyzeAction {
    if (matches.length === 0) return 'new';
    const strongActive = matches.filter((m) => m.status !== 'EXCLUDED' && (m.level === 'exact' || m.level === 'likely'));
    if (strongActive.length === 1) return 'update';
    return 'review';
}
