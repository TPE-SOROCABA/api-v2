Resolvendo problema migração do banco

- npx prisma migrate resolve --applied 20250130004437_ajusta_constrants

ALTER TABLE "participants"
ALTER COLUMN "email" SET NOT NULL;

CREATE UNIQUE INDEX "participants_email_key" ON "participants" ("email");
