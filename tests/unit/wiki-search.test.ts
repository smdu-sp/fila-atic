import { describe, expect, it } from "vitest";

import { serializeBlocks, type Block } from "@/lib/wikiBlocks";
import { foldAccents, searchNotebookPages, type SearchablePage } from "@/lib/wikiSearch";

const md = (text: string) => text; // legacy pages: content is plain Markdown
const blocks = (...texts: string[]): string =>
  serializeBlocks(texts.map((text, i) => ({ id: `b${i}`, type: "paragraph", text }) as Block));

const page = (over: Partial<SearchablePage>): SearchablePage => ({
  id: "id",
  title: "Título",
  parentId: null,
  content: "",
  ...over,
});

describe("foldAccents", () => {
  it("lowercases and strips the accented letters this wiki actually has", () => {
    expect(foldAccents("Configuração, Ambiguação e Ação")).toBe("configuracao, ambiguacao e acao");
    expect(foldAccents("São Paulo — Não")).toBe("sao paulo — nao");
  });

  it("never changes the string's length (indices found in it stay valid in the original)", () => {
    for (const text of ["ação", "SÃO PAULO", "café com pão", "normal text"]) {
      expect(foldAccents(text).length).toBe(text.length);
    }
  });
});

describe("searchNotebookPages", () => {
  it("returns nothing for an empty or blank query", () => {
    const pages = [page({ id: "a", title: "Servidores" })];
    expect(searchNotebookPages(pages, "")).toEqual([]);
    expect(searchNotebookPages(pages, "   ")).toEqual([]);
  });

  it("matches the title, accent- and case-insensitively, without a snippet", () => {
    const pages = [page({ id: "a", title: "Configuração de rede" })];
    const [result] = searchNotebookPages(pages, "CONFIGURACAO");

    expect(result).toMatchObject({ id: "a", title: "Configuração de rede", titleMatch: true, snippet: null });
  });

  it("matches inside the body of a page written in blocks, with a snippet", () => {
    const pages = [
      page({ id: "a", title: "Runbook", content: blocks("Passo um.", "Reinicie o serviço de impressão às 22h.") }),
    ];
    const [result] = searchNotebookPages(pages, "impressão");

    expect(result).toMatchObject({ id: "a", titleMatch: false });
    expect(result.snippet).toContain("impressão");
  });

  it("matches inside a page still stored as Markdown (not yet resaved as blocks)", () => {
    const pages = [page({ id: "a", title: "Antiga", content: md("# Antiga\n\nAlgo sobre o Postgres aqui.") })];
    expect(searchNotebookPages(pages, "postgres")).toMatchObject([{ id: "a", titleMatch: false }]);
  });

  it("does not match a page with neither the title nor the body containing the query", () => {
    const pages = [page({ id: "a", title: "Servidores", content: blocks("Nada a ver.") })];
    expect(searchNotebookPages(pages, "impressora")).toEqual([]);
  });

  it("puts every title match before every body-only match", () => {
    const pages = [
      page({ id: "body", title: "Outra coisa", content: blocks("fala sobre rede aqui") }),
      page({ id: "title", title: "Configuração de Rede" }),
    ];
    expect(searchNotebookPages(pages, "rede").map((r) => r.id)).toEqual(["title", "body"]);
  });

  it("orders body matches by how early the match sits in the page", () => {
    const pages = [
      page({ id: "late", title: "A", content: blocks("um parágrafo bem longo antes ".repeat(3) + "rede aqui") }),
      page({ id: "early", title: "B", content: blocks("rede logo no início") }),
    ];
    expect(searchNotebookPages(pages, "rede").map((r) => r.id)).toEqual(["early", "late"]);
  });

  it("builds the breadcrumb trail from the given pages, without needing extra data", () => {
    const pages = [
      page({ id: "root", title: "Servidores", parentId: null }),
      page({ id: "child", title: "Rede", parentId: "root", content: blocks("configuração de rede aqui") }),
    ];
    expect(searchNotebookPages(pages, "configuração")[0].breadcrumbs).toEqual([
      { id: "root", title: "Servidores" },
      { id: "child", title: "Rede" },
    ]);
  });

  it("never loops forever on a corrupted parent cycle", () => {
    const pages = [
      page({ id: "a", title: "A", parentId: "b", content: blocks("rede") }),
      page({ id: "b", title: "B", parentId: "a" }),
    ];
    expect(() => searchNotebookPages(pages, "rede")).not.toThrow();
  });

  it("caps the query length and the number of results", () => {
    const pages = Array.from({ length: 30 }, (_, i) => page({ id: `p${i}`, title: `Rede ${i}` }));
    expect(searchNotebookPages(pages, "rede")).toHaveLength(20);
    expect(searchNotebookPages(pages, "x".repeat(500))).toEqual([]);
  });

  it("truncates a long snippet with an ellipsis only on the side that was cut", () => {
    const pages = [page({ id: "a", title: "A", content: blocks("x".repeat(100) + "achado" + "y".repeat(100)) })];
    const [result] = searchNotebookPages(pages, "achado");

    expect(result.snippet?.startsWith("…")).toBe(true);
    expect(result.snippet?.endsWith("…")).toBe(true);
    expect(result.snippet).toContain("achado");
  });
});
