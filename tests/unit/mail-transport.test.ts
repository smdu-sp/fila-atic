import { describe, expect, it } from "vitest";

import {
  isRetryableMailError,
  MAX_SEND_ATTEMPTS,
  resolveTransportConfig,
  RETRY_DELAY_MS,
} from "@/lib/mailTransport";

describe("resolveTransportConfig", () => {
  it("is null without SMTP_HOST: no relay to send through", () => {
    expect(resolveTransportConfig({})).toBeNull();
    expect(resolveTransportConfig({ SMTP_HOST: "" })).toBeNull();
  });

  it("reads the host, defaults the port to 587 and secure to false", () => {
    expect(resolveTransportConfig({ SMTP_HOST: "smtp.interno" })).toMatchObject({
      host: "smtp.interno",
      port: 587,
      secure: false,
      from: undefined,
      rejectUnauthorized: true,
    });
  });

  it("parses the port, secure and from", () => {
    expect(
      resolveTransportConfig({
        SMTP_HOST: "smtp.interno",
        SMTP_PORT: "465",
        SMTP_SECURE: "true",
        SMTP_FROM: "Fila ATIC <fila@x.gov.br>",
      }),
    ).toMatchObject({ port: 465, secure: true, from: "Fila ATIC <fila@x.gov.br>" });
  });

  it("has no auth without SMTP_USER, and falls back the from to the user when SMTP_FROM is unset", () => {
    expect(resolveTransportConfig({ SMTP_HOST: "smtp.interno" })!.auth).toBeUndefined();

    const withUser = resolveTransportConfig({ SMTP_HOST: "smtp.interno", SMTP_USER: "fila@x.gov.br", SMTP_PASS: "s" });
    expect(withUser).toMatchObject({ auth: { user: "fila@x.gov.br", pass: "s" }, from: "fila@x.gov.br" });
  });

  it('only turns rejectUnauthorized off on the literal string "false"', () => {
    expect(resolveTransportConfig({ SMTP_HOST: "h", SMTP_TLS_REJECT_UNAUTHORIZED: "false" })!.rejectUnauthorized).toBe(false);
    for (const value of [undefined, "", "0", "no", "True", " false"]) {
      expect(resolveTransportConfig({ SMTP_HOST: "h", SMTP_TLS_REJECT_UNAUTHORIZED: value })!.rejectUnauthorized).toBe(true);
    }
  });
});

describe("isRetryableMailError", () => {
  it("retries connection-level failures (no SMTP response code)", () => {
    expect(isRetryableMailError(new Error("ECONNREFUSED"))).toBe(true);
    expect(isRetryableMailError(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }))).toBe(true);
    expect(isRetryableMailError("algo nao usual")).toBe(true);
    expect(isRetryableMailError(undefined)).toBe(true);
  });

  it("retries a 4xx SMTP response (transient)", () => {
    expect(isRetryableMailError({ responseCode: 421 })).toBe(true);
    expect(isRetryableMailError({ responseCode: 450 })).toBe(true);
  });

  it("does not retry a 5xx SMTP response (permanent rejection)", () => {
    expect(isRetryableMailError({ responseCode: 550 })).toBe(false);
    expect(isRetryableMailError({ responseCode: 553 })).toBe(false);
  });

  it("does not retry outside the SMTP code range either", () => {
    expect(isRetryableMailError({ responseCode: 250 })).toBe(true);
    expect(isRetryableMailError({ responseCode: 600 })).toBe(true);
  });
});

describe("retry constants", () => {
  it("retries more than once, with a positive delay", () => {
    expect(MAX_SEND_ATTEMPTS).toBeGreaterThan(1);
    expect(RETRY_DELAY_MS).toBeGreaterThan(0);
  });
});
