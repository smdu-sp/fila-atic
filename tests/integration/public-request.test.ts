import { beforeEach, describe, expect, it } from "vitest";
import { ProjectStatus, Role } from "@prisma/client";

import {
  confirmPublicRequest,
  createGuestMessage,
  submitPublicRequest,
} from "@/actions/publicRequestActions";
import { hashToken } from "@/lib/publicRequest";
import { mailsSent, makeUser, prisma, resetDb } from "../helpers";

const person = {
  name: "Maria Teste Silva",
  email: "maria@teste.gov.br",
  department: "Setor de Teste",
  title: "Preciso de um sistema novo",
  description: "Descricao longa o suficiente para passar",
  justification: "Justificativa longa o suficiente para passar",
};

const tokenFromLastMail = () => {
  const text = mailsSent().at(-1)?.text ?? "";
  return /\/solicitar\/confirmar\/([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? "";
};

async function submitAndConfirm(overrides: Partial<typeof person> = {}) {
  const sent = await submitPublicRequest({ ...person, ...overrides });
  expect(sent.success).toBe(true);
  const confirmed = await confirmPublicRequest(tokenFromLastMail());
  if (!confirmed.success) throw new Error(confirmed.error);
  return confirmed.data.trackingToken;
}

beforeEach(resetDb);

describe("submitting the public form", () => {
  it("refuses e-mails outside the allowed domains", async () => {
    const result = await submitPublicRequest({ ...person, email: "x@gmail.com" });
    expect(result).toMatchObject({ success: false });
    expect(await prisma.pendingGuestRequest.count()).toBe(0);
  });

  it("validates the basic fields", async () => {
    expect(await submitPublicRequest({ ...person, name: "ab" })).toMatchObject({ success: false });
    expect(await submitPublicRequest({ ...person, description: "curta" })).toMatchObject({ success: false });
  });

  it("silently ignores submissions that fill the honeypot", async () => {
    const result = await submitPublicRequest({ ...person, website: "http://spam" });
    expect(result.success).toBe(true);
    expect(await prisma.pendingGuestRequest.count()).toBe(0);
    expect(mailsSent()).toHaveLength(0);
  });

  it("only stores a pending request and sends the confirmation e-mail", async () => {
    const result = await submitPublicRequest(person);
    expect(result.success).toBe(true);

    expect(await prisma.pendingGuestRequest.count()).toBe(1);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.project.count()).toBe(0);

    const mail = mailsSent().at(-1);
    expect(mail?.to).toBe(person.email);
    const token = tokenFromLastMail();
    expect(token).toHaveLength(43);
    // the database keeps only a hash of the token
    const pending = await prisma.pendingGuestRequest.findFirstOrThrow();
    expect(pending.tokenHash).toBe(hashToken(token));
    expect(pending.tokenHash).not.toBe(token);
  });

  it("limits how many requests one e-mail can send per hour", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await submitPublicRequest({ ...person, title: `Pedido ${i}` }));
    }
    expect(results.map((r) => r.success)).toEqual([true, true, true, false]);
  });

  it("enforces required and typed custom fields", async () => {
    const field = await prisma.projectRequestField.create({
      data: {
        label: "Tipo",
        placeholder: "Tipo",
        order: 10,
        fieldType: "SELECT",
        options: "Erro,Melhoria",
        required: true,
      },
    });

    expect(await submitPublicRequest(person)).toMatchObject({ success: false });
    expect(
      await submitPublicRequest({ ...person, customFields: { [field.id]: "Outra" } }),
    ).toMatchObject({ success: false });
    expect(
      await submitPublicRequest({ ...person, customFields: { [field.id]: "Erro" } }),
    ).toMatchObject({ success: true });
  });
});

describe("confirming", () => {
  it("creates the guest, the project and a tracking token", async () => {
    const tracking = await submitAndConfirm();

    const user = await prisma.user.findFirstOrThrow();
    expect(user).toMatchObject({ isGuest: true, role: Role.REQUESTER, email: person.email });

    const project = await prisma.project.findFirstOrThrow();
    expect(project).toMatchObject({
      status: ProjectStatus.IN_QUEUE,
      requesterId: user.id,
      trackingToken: tracking,
    });
    expect(await prisma.pendingGuestRequest.count()).toBe(0);
    // second mail carries the tracking link
    expect(mailsSent().at(-1)?.text).toContain(`/acompanhar/${tracking}`);
  });

  it("does not create a second project when the link is used twice", async () => {
    await submitPublicRequest(person);
    const token = tokenFromLastMail();

    expect(await confirmPublicRequest(token)).toMatchObject({ success: true });
    expect(await confirmPublicRequest(token)).toMatchObject({ success: false });
    expect(await prisma.project.count()).toBe(1);
  });

  it("survives two simultaneous clicks with a single project", async () => {
    await submitPublicRequest(person);
    const token = tokenFromLastMail();

    const results = await Promise.all([confirmPublicRequest(token), confirmPublicRequest(token)]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(await prisma.project.count()).toBe(1);
  });

  it("refuses expired and unknown tokens", async () => {
    await submitPublicRequest(person);
    const token = tokenFromLastMail();
    await prisma.pendingGuestRequest.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    expect(await confirmPublicRequest(token)).toMatchObject({ success: false });
    expect(await confirmPublicRequest("x".repeat(43))).toMatchObject({ success: false });
    expect(await prisma.project.count()).toBe(0);
  });

  it("attaches the project to an existing account, matching e-mail case-insensitively", async () => {
    const real = await makeUser(Role.REQUESTER, { email: "VITOR@PREFEITURA.SP.GOV.BR" });

    await submitAndConfirm({ email: "vitor@prefeitura.sp.gov.br" });

    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.project.findFirstOrThrow()).toMatchObject({ requesterId: real.id });
  });

  it("does not attach requests to a deactivated account", async () => {
    await makeUser(Role.REQUESTER, { email: "off@teste.gov.br", isActive: false });
    await submitPublicRequest({ ...person, email: "off@teste.gov.br" });

    expect(await confirmPublicRequest(tokenFromLastMail())).toMatchObject({ success: false });
    expect(await prisma.project.count()).toBe(0);
  });
});

describe("guest messages", () => {
  const form = (fields: Record<string, string>, files: File[] = []) => {
    const data = new FormData();
    Object.entries(fields).forEach(([k, v]) => data.set(k, v));
    files.forEach((f) => data.append("attachments", f));
    return data;
  };

  it("lets the guest write on an open request, only with the right token", async () => {
    const tracking = await submitAndConfirm();

    expect(await createGuestMessage(form({ token: tracking, message: "Mais detalhes aqui" })))
      .toMatchObject({ success: true });
    expect(await createGuestMessage(form({ token: "x".repeat(43), message: "Mais detalhes aqui" })))
      .toMatchObject({ success: false });

    const logs = await prisma.projectLog.findMany({ where: { isInternal: false } });
    expect(logs).toHaveLength(1);
    expect(logs[0].authorName).toBe(person.name);
  });

  it("refuses dangerous attachments and closed requests", async () => {
    const tracking = await submitAndConfirm();

    const html = new File(["<script>"], "x.html", { type: "text/html" });
    expect(await createGuestMessage(form({ token: tracking, message: "com anexo" }, [html])))
      .toMatchObject({ success: false });

    await prisma.project.updateMany({ data: { status: ProjectStatus.FINISHED } });
    expect(await createGuestMessage(form({ token: tracking, message: "depois de fechar" })))
      .toMatchObject({ success: false });
  });
});
