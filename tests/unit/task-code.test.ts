import { describe, expect, it } from "vitest";

import { extractTaskRefs, formatTaskCode, suggestBranchName } from "@/lib/taskCode";

describe("formatTaskCode", () => {
  it("is the project code plus the task number", () => {
    expect(formatTaskCode(1, 3)).toBe("ATC-0001-3");
    expect(formatTaskCode(123, 45)).toBe("ATC-0123-45");
    expect(formatTaskCode(12345, 1)).toBe("ATC-12345-1");
  });
});

describe("extractTaskRefs", () => {
  it("finds codes in messages and branch names, ignoring case and zero padding", () => {
    expect(extractTaskRefs("fix: login (ATC-0001-3)")).toEqual([{ projectCode: 1, number: 3 }]);
    expect(extractTaskRefs("atc-1-3 corrige")).toEqual([{ projectCode: 1, number: 3 }]);
    expect(extractTaskRefs("feature/ATC-0002-15-tela-de-login")).toEqual([{ projectCode: 2, number: 15 }]);
  });

  it("finds several, once each, in order", () => {
    expect(extractTaskRefs("ATC-0001-3, ATC-0002-1 e de novo ATC-0001-3 / atc-1-3")).toEqual([
      { projectCode: 1, number: 3 },
      { projectCode: 2, number: 1 },
    ]);
  });

  it("does not take a bare project code, a zero number or a longer word for a task", () => {
    expect(extractTaskRefs("ATC-0001 sem tarefa")).toEqual([]);
    expect(extractTaskRefs("ATC-0001-0")).toEqual([]);
    expect(extractTaskRefs("XATC-0001-3")).toEqual([]);
    expect(extractTaskRefs("ATC-0001-3abc")).toEqual([{ projectCode: 1, number: 3 }]);
    expect(extractTaskRefs("ATC-1-12345678")).toEqual([]);
    expect(extractTaskRefs("")).toEqual([]);
  });
});

describe("suggestBranchName", () => {
  it("puts the code and a slug of the title in a feature branch", () => {
    expect(suggestBranchName("ATC-0001-3", "Corrigir validação do prazo!")).toBe("feature/ATC-0001-3-corrigir-validacao-do-prazo");
  });

  it("keeps the name short, without a dangling dash, and copes with titles that have no letters", () => {
    const name = suggestBranchName("ATC-0001-3", "uma tarefa com um título muito mais longo do que cabe numa branch");
    expect(name.startsWith("feature/ATC-0001-3-")).toBe(true);
    expect(name.length).toBeLessThanOrEqual("feature/ATC-0001-3-".length + 40);
    expect(name.endsWith("-")).toBe(false);
    expect(suggestBranchName("ATC-0001-3", "???")).toBe("feature/ATC-0001-3");
  });
});
