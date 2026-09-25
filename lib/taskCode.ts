import { formatProjectCode } from "@/lib/projectCode";

// Human-facing task code: the project code plus the task's number inside the
// project, "ATC-0001-3". It is what people write in commit messages, branch
// names and pull requests so GitHub activity finds its task.
export const formatTaskCode = (projectCode: number, taskNumber: number) =>
  `${formatProjectCode(projectCode)}-${taskNumber}`;

export type TaskRef = { projectCode: number; number: number };

// "ATC-0001-3", "atc-1-3" and "feature/ATC-0001-3-login" all cite the task 3
// of project 1. A bare project code ("ATC-0001") cites nothing. The same task
// cited twice comes back once, in order of first appearance.
export function extractTaskRefs(text: string): TaskRef[] {
  const refs: TaskRef[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(/(?<![A-Za-z0-9])ATC-(\d{1,6})-(\d{1,6})(?!\d)/gi)) {
    const ref = { projectCode: Number(match[1]), number: Number(match[2]) };
    const key = `${ref.projectCode}-${ref.number}`;

    if (ref.number > 0 && !seen.has(key)) {
      seen.add(key);
      refs.push(ref);
    }
  }

  return refs;
}

// A branch name that carries the task code, for the person who is about to
// start the work: "feature/ATC-0001-3-corrigir-login".
export function suggestBranchName(code: string, title: string) {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");

  return slug ? `feature/${code}-${slug}` : `feature/${code}`;
}
