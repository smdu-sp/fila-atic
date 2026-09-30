import { describe, expect, it } from "vitest";

import type { ProjectRequestFieldConfig } from "@/lib/requestForm";
import {
  fieldsForStep,
  isEmptyCustomValue,
  missingRequiredFields,
  validateGuestIdentity,
  wizardSteps,
} from "@/lib/requestWizard";

const field = (over: Partial<ProjectRequestFieldConfig>): ProjectRequestFieldConfig => ({
  id: over.id ?? "id",
  key: null,
  label: "Campo",
  placeholder: "",
  helperText: null,
  order: 1,
  step: 3,
  isSystem: false,
  fieldType: "TEXT",
  options: null,
  required: false,
  isActive: true,
  ...over,
});

describe("wizardSteps", () => {
  it("is 4 steps for a guest (with identity) and 3 for a logged-in requester (without)", () => {
    expect(wizardSteps(true)).toEqual(["intro", "identity", "basics", "details"]);
    expect(wizardSteps(false)).toEqual(["intro", "basics", "details"]);
  });
});

describe("fieldsForStep", () => {
  it("keeps only active fields of the given step, in order", () => {
    const fields = [
      field({ id: "b", step: 3, order: 2, label: "B" }),
      field({ id: "a", step: 3, order: 1, label: "A" }),
      field({ id: "d", step: 4, order: 1, label: "D" }),
      field({ id: "inactive", step: 3, order: 0, isActive: false }),
    ];
    expect(fieldsForStep(fields, 3).map((f) => f.id)).toEqual(["a", "b"]);
    expect(fieldsForStep(fields, 4).map((f) => f.id)).toEqual(["d"]);
  });

  it("never shows priority to the requester, whichever step it is configured on", () => {
    const fields = [field({ id: "priority", key: "priority", step: 3, isSystem: true })];
    expect(fieldsForStep(fields, 3)).toEqual([]);
  });
});

describe("isEmptyCustomValue", () => {
  it("treats blank or whitespace-only text as empty", () => {
    const text = field({ fieldType: "TEXT" });
    expect(isEmptyCustomValue(text, undefined)).toBe(true);
    expect(isEmptyCustomValue(text, "   ")).toBe(true);
    expect(isEmptyCustomValue(text, "ok")).toBe(false);
  });

  it("parses MULTI_SELECT as JSON and is empty only with no items selected", () => {
    const multi = field({ fieldType: "MULTI_SELECT" });
    expect(isEmptyCustomValue(multi, undefined)).toBe(true);
    expect(isEmptyCustomValue(multi, "[]")).toBe(true);
    expect(isEmptyCustomValue(multi, "not json")).toBe(true);
    expect(isEmptyCustomValue(multi, JSON.stringify(["A"]))).toBe(false);
  });
});

describe("missingRequiredFields", () => {
  it("only flags required, custom, empty fields — system fields are the zod schema's job", () => {
    const fields = [
      field({ id: "required-empty", required: true }),
      field({ id: "required-filled", required: true }),
      field({ id: "optional-empty", required: false }),
      field({ id: "system-required", required: true, isSystem: true, key: "title" }),
    ];
    const values: Record<string, string> = { "required-filled": "ok" };

    expect(missingRequiredFields(fields, (id) => values[id]).map((f) => f.id)).toEqual(["required-empty"]);
  });
});

describe("validateGuestIdentity", () => {
  const noDomainLimit: string[] = [];

  it("accepts a plausible name, e-mail and department", () => {
    expect(validateGuestIdentity({ name: "Fulano de Tal", email: "fulano@x.gov.br", department: "TI" }, noDomainLimit)).toEqual({});
  });

  it("rejects a name or department that is too short, trimming whitespace first", () => {
    expect(validateGuestIdentity({ name: "  Fu ", email: "a@x.gov.br", department: "TI" }, noDomainLimit).name).toBe(
      "Informe seu nome",
    );
    expect(validateGuestIdentity({ name: "Fulano", email: "a@x.gov.br", department: " T " }, noDomainLimit).department).toBe(
      "Informe seu setor",
    );
  });

  it("rejects an e-mail without the basic shape", () => {
    expect(validateGuestIdentity({ name: "Fulano", email: "nao-e-email", department: "TI" }, noDomainLimit).email).toBe(
      "Informe um e-mail valido",
    );
  });

  it("enforces the allowed domains, case-insensitively, only when a list is given", () => {
    const domains = ["prefeitura.sp.gov.br"];
    expect(validateGuestIdentity({ name: "Fulano", email: "a@OUTRO.com", department: "TI" }, domains).email).toContain(
      "prefeitura.sp.gov.br",
    );
    expect(validateGuestIdentity({ name: "Fulano", email: "A@Prefeitura.SP.gov.br", department: "TI" }, domains)).toEqual({});
    expect(validateGuestIdentity({ name: "Fulano", email: "a@qualquer.com", department: "TI" }, [])).toEqual({});
  });

  it("reports every field that fails, not just the first", () => {
    const errors = validateGuestIdentity({ name: "x", email: "nope", department: "" }, noDomainLimit);
    expect(Object.keys(errors).sort()).toEqual(["department", "email", "name"]);
  });
});
