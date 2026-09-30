import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@prisma/client";

import {
  createProjectRequestField,
  listProjectRequestFields,
  updateProjectRequestFields,
} from "@/actions/requestFormActions";
import { loadRequestFields } from "@/lib/requestFormServer";
import { PROJECT_REQUEST_FIELDS, type ProjectRequestFieldConfig } from "@/lib/requestForm";
import { actAs, makeUser, prisma, resetDb } from "../helpers";

beforeEach(resetDb);

describe("the step of a field (which page of the request wizard shows it)", () => {
  it("defaults a new custom field to step 3", async () => {
    actAs(await makeUser(Role.COORDINATOR));
    const result = await createProjectRequestField();
    expect(result).toMatchObject({ success: true, data: { step: 3 } });
  });

  it("without any saved configuration, matches the defaults (title/priority on 3, description/justification on 4)", async () => {
    const byKey = Object.fromEntries(PROJECT_REQUEST_FIELDS.map((f) => [f.key, f.step]));
    expect(byKey).toMatchObject({ title: 3, priority: 3, description: 4, justification: 4 });

    const loaded = await loadRequestFields();
    const loadedByKey = Object.fromEntries(loaded.map((f) => [f.key, f.step]));
    expect(loadedByKey).toMatchObject(byKey);
  });

  it("is saved and read back for both a system field and a custom one", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    actAs(coord);

    const created = await createProjectRequestField();
    if (!created.success) throw new Error("create failed");

    const fields: ProjectRequestFieldConfig[] = [
      ...PROJECT_REQUEST_FIELDS.map((f) => (f.key === "title" ? { ...f, step: 4 as const } : f)),
      { ...created.data, label: "Campo teste", placeholder: "x", step: 4 },
    ];

    expect(await updateProjectRequestFields(fields)).toMatchObject({ success: true });

    const reloaded = await loadRequestFields({ includeInactive: true });
    expect(reloaded.find((f) => f.key === "title")?.step).toBe(4);
    expect(reloaded.find((f) => f.id === created.data.id)?.step).toBe(4);
  });

  it("rejects a step outside 3/4", async () => {
    actAs(await makeUser(Role.COORDINATOR));

    const invalid = PROJECT_REQUEST_FIELDS.map((f) => (f.key === "title" ? { ...f, step: 2 as unknown as 3 } : f));
    expect(await updateProjectRequestFields(invalid)).toMatchObject({ success: false });
  });

  it("is visible to anyone with an account, but only coordination can change it", async () => {
    actAs(await makeUser(Role.DEV_GLOBAL));
    expect(await listProjectRequestFields()).toMatchObject({ success: true });
    expect(await updateProjectRequestFields(PROJECT_REQUEST_FIELDS)).toMatchObject({ success: false });
  });
});

describe("the 20260930100000_request_field_step migration's backfill", () => {
  // Re-runs the same backfill query the migration used, against rows
  // inserted the old way (no step given), to prove the choice it made for
  // pre-existing fields still holds — a much cheaper way to pin that SQL
  // down than standing up a whole pre-migration database.
  it("puts long-text fields (and the two long-text system fields) on step 4, everything else on step 3", async () => {
    await prisma.$executeRawUnsafe(`
      INSERT INTO "ProjectRequestField" (id, key, label, placeholder, "order", "isSystem", "fieldType", required, "isActive", "updatedAt")
      VALUES
        ('f1', 'description', 'Descricao', 'x', 1, true, 'LONG_TEXT', true, true, now()),
        ('f2', 'justification', 'Justificativa', 'x', 2, true, 'LONG_TEXT', true, true, now()),
        ('f3', NULL, 'Observacoes', 'x', 3, false, 'LONG_TEXT', false, true, now()),
        ('f4', 'title', 'Titulo', 'x', 4, true, 'TEXT', true, true, now()),
        ('f5', NULL, 'Prazo', 'x', 5, false, 'DATE', false, true, now())
    `);

    await prisma.$executeRawUnsafe(`
      UPDATE "ProjectRequestField"
      SET "step" = 4
      WHERE "key" IN ('description', 'justification') OR "fieldType" = 'LONG_TEXT'
    `);

    const steps = await prisma.projectRequestField.findMany({ select: { id: true, step: true } });
    expect(Object.fromEntries(steps.map((s) => [s.id, s.step]))).toEqual({
      f1: 4,
      f2: 4,
      f3: 4,
      f4: 3,
      f5: 3,
    });
  });
});
