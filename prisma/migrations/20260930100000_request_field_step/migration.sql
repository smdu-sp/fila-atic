-- Which wizard step (3 "Dados da solicitação", 4 "Detalhes") a field shows
-- on. Existing rows are backfilled by a reasonable guess: the long-text
-- system fields (description, justification) and any custom long-text field
-- go to step 4; everything else (short system/custom fields) goes to step 3.
-- A coordinator can move any field afterwards in Administração > Solicitação.
ALTER TABLE "ProjectRequestField" ADD COLUMN "step" INTEGER NOT NULL DEFAULT 3;

UPDATE "ProjectRequestField"
SET "step" = 4
WHERE "key" IN ('description', 'justification') OR "fieldType" = 'LONG_TEXT';
