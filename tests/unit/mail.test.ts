// Exercises the real lib/mail.ts (the global test setup replaces it with a
// stub for every other test file — see tests/setup.ts). nodemailer itself is
// mocked, so this never touches the network; MailLog is written to the real
// test database, like the rest of the integration tests.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma, resetDb } from "../helpers";

vi.unmock("@/lib/mail");

// vi.mock is hoisted above these const declarations, so the mocks it uses
// have to be created through vi.hoisted (also hoisted, but before vi.mock).
const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn();
  const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
  return { sendMailMock, createTransportMock };
});
vi.mock("nodemailer", () => ({ default: { createTransport: createTransportMock } }));

const ORIGINAL_ENV = { ...process.env };

// A fresh import per test, so lib/mail's cached transport (module-level
// state) starts over and picks up this test's env vars.
async function freshMailModule() {
  vi.resetModules();
  return import("@/lib/mail");
}

const setEnv = (values: Record<string, string | undefined>) => {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

beforeEach(async () => {
  await resetDb();
  process.env = { ...ORIGINAL_ENV };
  sendMailMock.mockReset();
  createTransportMock.mockClear();
});

const logsOf = () => prisma.mailLog.findMany({ orderBy: { createdAt: "asc" } });

describe("sendMail without SMTP_HOST (no relay configured)", () => {
  it("prints to the console and logs as skipped outside production", async () => {
    setEnv({ SMTP_HOST: undefined, NODE_ENV: "test" });
    const { sendMail } = await freshMailModule();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await sendMail({ to: "a@x.gov.br", subject: "Oi", text: "corpo", kind: "test" });

    expect(info).toHaveBeenCalledOnce();
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(await logsOf()).toMatchObject([{ status: "skipped", kind: "test", to: "a@x.gov.br", attempts: 0 }]);
    info.mockRestore();
  });

  it("throws and logs as failed in production", async () => {
    setEnv({ SMTP_HOST: undefined, NODE_ENV: "production" });
    const { sendMail } = await freshMailModule();

    await expect(sendMail({ to: "a@x.gov.br", subject: "Oi", text: "corpo" })).rejects.toThrow("SMTP nao configurado");
    expect(await logsOf()).toMatchObject([{ status: "failed", kind: "other", error: "SMTP nao configurado" }]);
  });
});

describe("sendMail with SMTP_HOST configured", () => {
  const configure = () =>
    setEnv({ SMTP_HOST: "smtp.interno", SMTP_PORT: "587", SMTP_FROM: "Fila ATIC <fila@x.gov.br>", NODE_ENV: "test" });

  it("sends once on the first try and logs it as sent", async () => {
    configure();
    sendMailMock.mockResolvedValueOnce({ messageId: "1" });
    const { sendMail } = await freshMailModule();

    await sendMail({ to: "a@x.gov.br", subject: "Oi", text: "corpo", kind: "notification" });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith({ from: "Fila ATIC <fila@x.gov.br>", to: "a@x.gov.br", subject: "Oi", text: "corpo" });
    expect(await logsOf()).toMatchObject([{ status: "sent", kind: "notification", attempts: 1 }]);
  });

  it("reuses one transport across several sends (connection pooling)", async () => {
    configure();
    sendMailMock.mockResolvedValue({});
    const { sendMail } = await freshMailModule();

    await sendMail({ to: "a@x.gov.br", subject: "1", text: "x" });
    await sendMail({ to: "b@x.gov.br", subject: "2", text: "x" });

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledTimes(2);
  });

  it("retries a transient failure and succeeds, recording the attempt count", async () => {
    configure();
    sendMailMock
      .mockRejectedValueOnce(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }))
      .mockResolvedValueOnce({});
    const { sendMail } = await freshMailModule();

    await sendMail({ to: "a@x.gov.br", subject: "Oi", text: "corpo" });

    expect(sendMailMock).toHaveBeenCalledTimes(2);
    expect(await logsOf()).toMatchObject([{ status: "sent", attempts: 2 }]);
  }, 10000);

  it("does not retry a permanent SMTP rejection, and rethrows it", async () => {
    configure();
    const rejection = Object.assign(new Error("550 mailbox unavailable"), { responseCode: 550 });
    sendMailMock.mockRejectedValue(rejection);
    const { sendMail } = await freshMailModule();

    await expect(sendMail({ to: "a@x.gov.br", subject: "Oi", text: "corpo", kind: "test" })).rejects.toBe(rejection);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(await logsOf()).toMatchObject([{ status: "failed", attempts: 1, error: "550 mailbox unavailable" }]);
  });

  it("gives up after exhausting the retries on a transient failure", async () => {
    configure();
    sendMailMock.mockRejectedValue(new Error("ECONNRESET"));
    const { sendMail } = await freshMailModule();

    await expect(sendMail({ to: "a@x.gov.br", subject: "Oi", text: "corpo" })).rejects.toThrow("ECONNRESET");

    expect(sendMailMock).toHaveBeenCalledTimes(3);
    expect(await logsOf()).toMatchObject([{ status: "failed", attempts: 3 }]);
  }, 10000);
});
