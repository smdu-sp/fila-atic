import { blocksToPlainText, parseContent } from "@/lib/wikiBlocks";

// Wiki search: title and page content, accent-insensitive. Pure and
// synchronous — actions/notebookActions.ts does the one query (every page's
// id/title/parentId/content) and hands the rows here, so this is testable
// without a database and the breadcrumb trail costs no extra queries (built
// by walking the same rows in memory instead of actions/notebookActions.ts's
// per-page breadcrumbsOf, which is fine for one page but not for 20 results).

export type SearchablePage = {
  id: string;
  title: string;
  parentId: string | null;
  content: string;
};

export type NotebookSearchResult = {
  id: string;
  title: string;
  // whether the query matched the title (shown without a snippet) or only
  // turned up inside the body (shown with one, for context)
  titleMatch: boolean;
  snippet: string | null;
  breadcrumbs: Array<{ id: string; title: string }>;
};

export const MAX_SEARCH_RESULTS = 20;
export const MAX_QUERY_LENGTH = 100;

const ACCENTS: Record<string, string> = {
  á: "a", à: "a", â: "a", ã: "a", ä: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  í: "i", ì: "i", î: "i", ï: "i",
  ó: "o", ò: "o", ô: "o", õ: "o", ö: "o",
  ú: "u", ù: "u", û: "u", ü: "u",
  ç: "c", ñ: "n",
};

// Lowercases and strips accents one character at a time (never adds or
// removes one), so an index found in the folded string is still valid in the
// original — unlike Unicode NFD normalization, which turns "ã" into two
// code points and would shift every index after it.
export function foldAccents(text: string): string {
  return text.toLowerCase().replace(/[áàâãäéèêëíìîïóòôõöúùûüçñ]/g, (char) => ACCENTS[char] ?? char);
}

const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 80;

// A short, single-line excerpt of `text` around `at` (an index into `text`),
// with the surrounding whitespace collapsed and an ellipsis on whichever
// side was cut.
function snippetAround(text: string, at: number, matchLength: number): string {
  const start = Math.max(0, at - SNIPPET_BEFORE);
  const end = Math.min(text.length, at + matchLength + SNIPPET_AFTER);
  const middle = text.slice(start, end).replace(/\s+/g, " ").trim();

  return `${start > 0 ? "…" : ""}${middle}${end < text.length ? "…" : ""}`;
}

function breadcrumbsOf(
  pageId: string,
  byId: Map<string, { title: string; parentId: string | null }>,
): Array<{ id: string; title: string }> {
  const trail: Array<{ id: string; title: string }> = [];
  let currentId: string | null = pageId;
  // guards against a corrupted cycle looping forever; the wiki itself
  // already refuses to create one (see wouldCreateCycle)
  const seen = new Set<string>();

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const page = byId.get(currentId);
    if (!page) break;
    trail.unshift({ id: currentId, title: page.title });
    currentId = page.parentId;
  }

  return trail;
}

export function searchNotebookPages(pages: SearchablePage[], rawQuery: string): NotebookSearchResult[] {
  const query = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);
  if (!query) return [];

  const foldedQuery = foldAccents(query);
  const byId = new Map(pages.map((page) => [page.id, { title: page.title, parentId: page.parentId }]));

  const titleMatches: NotebookSearchResult[] = [];
  const bodyMatches: Array<NotebookSearchResult & { at: number }> = [];

  for (const page of pages) {
    if (foldAccents(page.title).includes(foldedQuery)) {
      titleMatches.push({
        id: page.id,
        title: page.title,
        titleMatch: true,
        snippet: null,
        breadcrumbs: breadcrumbsOf(page.id, byId),
      });
      continue;
    }

    const plainText = blocksToPlainText(parseContent(page.content));
    const at = foldAccents(plainText).indexOf(foldedQuery);
    if (at === -1) continue;

    bodyMatches.push({
      id: page.id,
      title: page.title,
      titleMatch: false,
      snippet: snippetAround(plainText, at, query.length),
      breadcrumbs: breadcrumbsOf(page.id, byId),
      at,
    });
  }

  titleMatches.sort((a, b) => a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" }));
  // an earlier match reads as more central to the page than one buried deep in it
  bodyMatches.sort((a, b) => a.at - b.at);

  const bodyResults: NotebookSearchResult[] = bodyMatches.map((match) => ({
    id: match.id,
    title: match.title,
    titleMatch: match.titleMatch,
    snippet: match.snippet,
    breadcrumbs: match.breadcrumbs,
  }));

  return [...titleMatches, ...bodyResults].slice(0, MAX_SEARCH_RESULTS);
}
