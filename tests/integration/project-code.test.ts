import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@prisma/client";

import { createProject, searchProjects } from "@/actions/projectActions";
import { getProjectDetails } from "@/actions/solicitacaoActions";
import { searchQueue } from "@/actions/queueActions";
import { actAs, makeUser, prisma, resetDb } from "../helpers";

beforeEach(resetDb);

describe("project code", () => {
  it("is assigned sequentially, in creation order, and never reused", async () => {
    const requester = await makeUser(Role.REQUESTER);
    actAs(requester);

    const a = await createProject({
      title: "Primeiro projeto",
      description: "Descricao do primeiro",
      justification: "Justificativa do primeiro",
    });
    const b = await createProject({
      title: "Segundo projeto",
      description: "Descricao do segundo",
      justification: "Justificativa do segundo",
    });
    expect(a.success && b.success).toBe(true);
    if (!a.success || !b.success) return;

    const codeOf = async (id: string) =>
      (await prisma.project.findUniqueOrThrow({ where: { id } })).code;
    const codeA = await codeOf(a.data);
    const codeB = await codeOf(b.data);
    expect(codeB).toBe(codeA + 1);

    // deleting a project never frees its code for reuse
    await prisma.project.delete({ where: { id: a.data } });
    const c = await createProject({
      title: "Terceiro projeto",
      description: "Descricao do terceiro",
      justification: "Justificativa do terceiro",
    });
    expect(c.success && (await codeOf(c.data))).not.toBe(codeA);
  });

  it("comes back from the project list, the queue and the details", async () => {
    const requester = await makeUser(Role.REQUESTER);
    const coord = await makeUser(Role.COORDINATOR);
    actAs(requester);
    const created = await createProject({
      title: "Projeto com codigo",
      description: "Descricao valida para o teste",
      justification: "Justificativa valida para o teste",
    });
    expect(created.success).toBe(true);
    if (!created.success) return;
    const code = (
      await prisma.project.findUniqueOrThrow({ where: { id: created.data } })
    ).code;

    actAs(coord);
    const list = await searchProjects({});
    const inList = list.success
      ? list.data.items.find((item) => item.id === created.data)
      : undefined;
    expect(inList?.code).toBe(code);

    const queue = await searchQueue({});
    const inQueue = queue.success
      ? queue.data.items.find((item) => item.id === created.data)
      : undefined;
    expect(inQueue?.code).toBe(code);

    const details = await getProjectDetails(created.data);
    expect(details.success && details.data.code).toBe(code);
  });
});
