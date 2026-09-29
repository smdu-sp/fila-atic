import path from "node:path";

// The one HTML layout every outgoing e-mail is built from (confirmation,
// tracking links, guest updates, staff notifications, the admin test send).
// Kept pure — no I/O, no Next/Prisma imports — so it is trivial to test: it
// takes structured content in and returns the finished html/text pair.
//
// Email HTML is its own, cramped platform (Outlook desktop renders with
// Word's engine): layout is a plain, single-column table, all styles are
// inlined, there is no flexbox/grid and no border-radius/shadow to rely on.
// The brand mark is embedded as a CID attachment (see EMAIL_LOGO_ATTACHMENT)
// instead of linked from the app's own URL, so it still renders for someone
// reading mail outside the network the app server lives on, and does not
// depend on the recipient's client choosing to load remote images at all.

export const EMAIL_BRAND_NAME = "Fila ATIC";
export const EMAIL_SIGNATURE_ORG = "Secretaria Municipal de Urbanismo e Licenciamento";

// Keep this in sync with --primary in app/globals.css (oklch(0.3709 0.1727
// 263.68) converted to sRGB hex — email clients do not understand oklch()).
const BRAND_COLOR = "#0a3299";
const TEXT_COLOR = "#1c1c1f";
const MUTED_COLOR = "#6b6b76";
const BACKGROUND_COLOR = "#f4f4f6";
const BORDER_COLOR = "#e4e4e9";

const LOGO_CID = "fila-atic-logo";

// A small (96x96, ~6 KB), pre-shrunk copy of public/smul_icone_branco.png —
// generated once, not resized on every send. See docs/... for how to redo it
// if the brand mark ever changes.
export const EMAIL_LOGO_ATTACHMENT = {
  filename: "fila-atic.png",
  path: path.join(process.cwd(), "public", "email-logo.png"),
  cid: LOGO_CID,
} as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// A paragraph may carry a line break (none of today's callers put one in,
// but nothing stops a future one); everything else in it is escaped first.
const escapeParagraph = (value: string) => escapeHtml(value).replace(/\n/g, "<br>");

export type EmailLink = { label: string; href: string };

export type EmailContent = {
  // "Olá, Fulano."
  greeting?: string;
  // The card's heading; every e-mail has one.
  heading: string;
  paragraphs?: string[];
  // One prominent action (a button in the html, the raw link in the text).
  cta?: EmailLink;
  // Several labelled links (e.g. one per project) instead of a single cta.
  links?: EmailLink[];
  // Small print under the content (legal note, opt-out hint).
  footnote?: string;
  // Inbox preview line; defaults to the first paragraph.
  preheader?: string;
};

export type RenderedEmail = { html: string; text: string };

const button = (link: EmailLink) => `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
          <tr>
            <td bgcolor="${BRAND_COLOR}" style="border-radius:6px;">
              <a href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(link.label)}</a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${MUTED_COLOR};">
          Se o botão não abrir, copie e cole este endereço no navegador:<br>
          <a href="${escapeHtml(link.href)}" style="color:${BRAND_COLOR};word-break:break-all;">${escapeHtml(link.href)}</a>
        </p>`;

const linkList = (links: EmailLink[]) => `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 20px;">
          ${links
            .map(
              (link) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid ${BORDER_COLOR};font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:${TEXT_COLOR};">${escapeHtml(link.label)}</p>
              <a href="${escapeHtml(link.href)}" style="font-size:13px;color:${BRAND_COLOR};word-break:break-all;">${escapeHtml(link.href)}</a>
            </td>
          </tr>`,
            )
            .join("")}
        </table>`;

export function renderEmail(content: EmailContent): RenderedEmail {
  const paragraphs = content.paragraphs ?? [];
  const preheader = content.preheader ?? paragraphs[0] ?? content.heading;

  const html = `<!doctype html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BACKGROUND_COLOR};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BACKGROUND_COLOR};">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid ${BORDER_COLOR};">
          <tr>
            <td bgcolor="${BRAND_COLOR}" style="padding:20px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right:10px;">
                    <img src="cid:${LOGO_CID}" width="28" height="28" alt="" style="display:block;">
                  </td>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;color:#ffffff;">
                    ${EMAIL_BRAND_NAME}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 28px;">
              ${
                content.greeting
                  ? `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:${TEXT_COLOR};">${escapeParagraph(content.greeting)}</p>`
                  : ""
              }
              <h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.35;color:${TEXT_COLOR};">${escapeHtml(content.heading)}</h1>
              ${paragraphs
                .map(
                  (paragraph) =>
                    `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${TEXT_COLOR};">${escapeParagraph(paragraph)}</p>`,
                )
                .join("")}
              ${content.cta ? button(content.cta) : ""}
              ${content.links?.length ? linkList(content.links) : ""}
              ${
                content.footnote
                  ? `<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:${MUTED_COLOR};">${escapeParagraph(content.footnote)}</p>`
                  : ""
              }
            </td>
          </tr>
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;">
          <tr>
            <td align="center" style="padding:16px 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${MUTED_COLOR};">
              ${EMAIL_BRAND_NAME} · ${EMAIL_SIGNATURE_ORG}<br>
              Mensagem automática; não é preciso responder este e-mail.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines: string[] = [];
  if (content.greeting) textLines.push(content.greeting, "");
  textLines.push(content.heading, "");
  for (const paragraph of paragraphs) textLines.push(paragraph, "");
  if (content.cta) textLines.push(content.cta.href, "");
  if (content.links?.length) {
    for (const link of content.links) textLines.push(`• ${link.label}`, `  ${link.href}`, "");
  }
  if (content.footnote) textLines.push(content.footnote, "");
  textLines.push(`${EMAIL_BRAND_NAME} - ${EMAIL_SIGNATURE_ORG}`);

  return { html, text: textLines.join("\n") };
}
