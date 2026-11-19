-- Data da última atualização do cadastro (pela própria pessoa, pelo link da designação, ou pela coordenação).
-- Nula = o cadastro nunca foi atualizado depois da petição. Coluna nova e opcional: não afeta nenhum dado existente.
ALTER TABLE "participants" ADD COLUMN "profile_updated_at" TIMESTAMP(3);
