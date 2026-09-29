import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

import { getMailStatus, sendTestEmail } from "@/actions/mailActions";
import { sendMail } from "@/lib/mail";
import { actAs, makeUser, prisma, resetDb } from "../helpers";

beforeEach(resetDb);

describe("getMailStatus", () => {
  it("is for coordination and tech lead only", async () => {
    for (const role of [Role.DEV_GLOBAL, Role.DEV_RESTRICTED, Role.REQUESTER]) {
      actAs(await makeUser(role));
      expect(await getMailStatus()).toMatchObject({ success: false, error: "Sem permissao" });
    }
    actAs(null);
    expect(await getMailStatus()).toMatchObject({ success: false, error: "Nao autenticado" });

    for (const role of [Role.COORDINATOR, Role.TECH_LEAD]) {
      actAs(await makeUser(role));
      expect(await getMailStatus()).toMatchObject({ success: true });
    }
  });

  it("reports whether SMTP is configured, without exposing the password", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    actAs(coord);
    const original = { ...process.env };

    delete process.env.SMTP_HOST;
    expect(await getMailStatus()).toMatchObject({ success: true, data: { configured: false, host: null } });

    process.env.SMTP_HOST = "smtp.interno";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_SECURE = "true";
    process.env.SMTP_USER = "fila@x.gov.br";
    process.env.SMTP_PASS = "segredo-super-secreto";
    process.env.SMTP_FROM = "Fila ATIC <fila@x.gov.br>";

    const result = await getMailStatus();
    if (!result.success) throw new Error(result.error);
    expect(result.data).toMatchObject({
      configured: true,
      host: "smtp.interno",
      port: 465,
      secure: true,
      authenticated: true,
      from: "Fila ATIC <fila@x.gov.br>",
    });
    expect(JSON.stringify(result.data)).not.toContain("segredo-super-secreto");

    process.env = original;
  });

  it("lists the most recent mail log entries", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    actAs(coord);
    // explicit, distinct timestamps: createMany runs in one statement, so
    // the default now() would give every row the same instant otherwise
    await prisma.mailLog.createMany({
      data: [
        { kind: "notification", to: "a@x.gov.br", subject: "1", status: "sent", createdAt: new Date("2026-09-01T10:00:00Z") },
        { kind: "test", to: "b@x.gov.br", subject: "2", status: "failed", error: "ECONNREFUSED", createdAt: new Date("2026-09-01T10:00:01Z") },
      ],
    });

    const result = await getMailStatus();
    expect(result.success && result.data.recent).toHaveLength(2);
    expect(result.success && result.data.recent[0].subject).toBe("2"); // most recent first
  });
});

describe("sendTestEmail", () => {
  it("is for coordination and tech lead only", async () => {
    actAs(await makeUser(Role.DEV_GLOBAL));
    expect(await sendTestEmail("a@x.gov.br")).toMatchObject({ success: false, error: "Sem permissao" });
  });

  it("validates the address before trying to send", async () => {
    actAs(await makeUser(Role.COORDINATOR));
    expect(await sendTestEmail("")).toMatchObject({ success: false });
    expect(await sendTestEmail("nao-e-email")).toMatchObject({ success: false });
    expect(vi.mocked(sendMail)).not.toHaveBeenCalled();
  });

  it("sends a test message to the given address", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    actAs(coord);

    const result = await sendTestEmail(" Alguem@X.gov.br ");

    expect(result).toMatchObject({ success: true });
    expect(vi.mocked(sendMail)).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "test", to: "alguem@x.gov.br" }),
    );
  });

  it("turns a delivery failure into a readable error instead of throwing", async () => {
    actAs(await makeUser(Role.COORDINATOR));
    vi.mocked(sendMail).mockRejectedValueOnce(new Error("SMTP nao configurado"));

    expect(await sendTestEmail("a@x.gov.br")).toMatchObject({ success: false, error: "SMTP nao configurado" });
  });
});
