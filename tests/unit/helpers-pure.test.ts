import { describe, expect, it } from "vitest";

import {
  generateToken,
  hashToken,
  isAllowedEmail,
  isValidTokenFormat,
  keyFor,
} from "@/lib/publicRequest";
import { hasCustomValue, parseMultiValue, parseOptions } from "@/lib/requestForm";
import { MAX_UPLOAD_FILES, MAX_UPLOAD_SIZE, validateUploads } from "@/lib/uploads";
import { getStatusLabel, getTaskStatusLabel } from "@/lib/projectLabels";

describe("request form helpers", () => {
  it("parses multi-select values defensively", () => {
    expect(parseMultiValue('["a","b"]')).toEqual(["a", "b"]);
    expect(parseMultiValue("not json")).toEqual([]);
    expect(parseMultiValue('{"a":1}')).toEqual([]);
    expect(parseMultiValue(undefined)).toEqual([]);
  });

  it("splits comma separated options and drops blanks", () => {
    expect(parseOptions(" a, b ,, c ")).toEqual(["a", "b", "c"]);
    expect(parseOptions(null)).toEqual([]);
  });

  it("treats an empty multi-select as no value", () => {
    expect(hasCustomValue("MULTI_SELECT", "[]")).toBe(false);
    expect(hasCustomValue("MULTI_SELECT", '["x"]')).toBe(true);
    expect(hasCustomValue("TEXT", "   ")).toBe(false);
    expect(hasCustomValue("TEXT", "ok")).toBe(true);
  });
});

describe("public request helpers", () => {
  it("accepts only configured e-mail domains, ignoring case", () => {
    expect(isAllowedEmail("ana@teste.gov.br")).toBe(true);
    expect(isAllowedEmail("ANA@TESTE.GOV.BR")).toBe(true);
    expect(isAllowedEmail("ana@gmail.com")).toBe(false);
    expect(isAllowedEmail("ana@sub.teste.gov.br")).toBe(false);
    expect(isAllowedEmail("sem-arroba")).toBe(false);
  });

  it("generates unguessable tokens that validate and hash consistently", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toHaveLength(43);
    expect(isValidTokenFormat(a)).toBe(true);
    expect(isValidTokenFormat("curto")).toBe(false);
    expect(isValidTokenFormat("../../etc/passwd" + "x".repeat(30))).toBe(false);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(a);
  });

  it("derives the same rate-limit key regardless of case and spaces", () => {
    expect(keyFor(" Ana@Teste.gov.br ")).toBe(keyFor("ana@teste.gov.br"));
    expect(keyFor("ana@teste.gov.br")).not.toBe(keyFor("bia@teste.gov.br"));
  });
});

describe("upload validation", () => {
  const file = (name: string, size = 10) =>
    new File([new Uint8Array(size)], name);

  it("accepts documents and images", () => {
    expect(validateUploads([file("a.pdf"), file("b.PNG")])).toBeNull();
  });

  it("refuses types that could run in the browser", () => {
    expect(validateUploads([file("x.html")])).toMatch(/nao permitido/);
    expect(validateUploads([file("x.svg")])).toMatch(/nao permitido/);
    expect(validateUploads([file("sem-extensao")])).toMatch(/nao permitido/);
  });

  it("enforces size and count limits", () => {
    expect(validateUploads([file("big.pdf", MAX_UPLOAD_SIZE + 1)])).toMatch(/acima de/);
    const many = Array.from({ length: MAX_UPLOAD_FILES + 1 }, (_, i) => file(`f${i}.pdf`));
    expect(validateUploads(many)).toMatch(/maximo/);
  });
});

describe("labels", () => {
  it("falls back to the raw value for unknown statuses", () => {
    expect(getStatusLabel("IN_QUEUE")).toBe("Na fila");
    expect(getTaskStatusLabel("TODO")).toBe("A fazer");
  });
});
