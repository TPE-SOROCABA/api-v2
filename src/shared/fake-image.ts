/**
 * Avatar de quem não tem foto cadastrada.
 *
 * Port 1:1 de `api/src/shared/FakeImage.ts` (legacy). A URL do ui-avatars é a mesma
 * de propósito: qualquer resposta antiga da legacy que ainda estiver em cache no
 * navegador continua apontando para a mesma imagem.
 *
 * Diferença deliberada: a versão legacy muta o objeto recebido; esta devolve só a
 * URL. Não queremos efeito colateral nos objetos que o Prisma devolveu.
 */
export function avatarUrl(name: string): string {
  return `https://ui-avatars.com/api/?name=${name}&background=2d3477&color=fff`;
}

export function profilePhotoOrAvatar(participant: { profilePhoto: string | null; name: string }): string {
  return participant.profilePhoto || avatarUrl(participant.name);
}
