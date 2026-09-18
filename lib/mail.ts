import nodemailer from "nodemailer";

// SMTP settings: SMTP_HOST, SMTP_PORT (default 587), SMTP_SECURE ("true" for
// implicit TLS, usually port 465), SMTP_USER/SMTP_PASS (optional) and SMTP_FROM.
// Without SMTP_HOST the message is printed to the console outside production,
// so the confirmation flow can be tried locally; in production it fails.

type Mail = { to: string; subject: string; text: string };

function createTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  const user = process.env.SMTP_USER;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: user ? { user, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

export async function sendMail({ to, subject, text }: Mail) {
  const transport = createTransport();

  if (!transport) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP nao configurado");
    }

    console.info(`[mail:dev] To: ${to}\nSubject: ${subject}\n\n${text}`);
    return;
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to,
    subject,
    text,
  });
}
