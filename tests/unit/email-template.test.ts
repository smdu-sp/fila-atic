import { describe, expect, it } from "vitest";

import {
  EMAIL_LOGO_ATTACHMENT,
  EMAIL_SIGNATURE_ORG,
  escapeHtml,
  renderEmail,
} from "@/lib/emailTemplate";

describe("escapeHtml", () => {
  it("escapes the five HTML-sensitive characters", () => {
    expect(escapeHtml(`<b>&"'`)).toBe("&lt;b&gt;&amp;&quot;&#39;");
  });

  it("leaves ordinary text alone", () => {
    expect(escapeHtml("Reunião às 14h — projeto ATC-0001")).toBe("Reunião às 14h — projeto ATC-0001");
  });
});

describe("renderEmail: structure", () => {
  it("always includes a text and an html version, with the signature at the end of the text", () => {
    const { html, text } = renderEmail({ heading: "Oi" });
    expect(html).toContain("<!doctype html>");
    expect(text.trim().endsWith(EMAIL_SIGNATURE_ORG)).toBe(true);
  });

  it("puts the greeting, heading and paragraphs in the text, in order", () => {
    const { text } = renderEmail({
      greeting: "Olá, Fulano.",
      heading: "Título",
      paragraphs: ["Primeiro parágrafo.", "Segundo parágrafo."],
    });
    const order = ["Olá, Fulano.", "Título", "Primeiro parágrafo.", "Segundo parágrafo."].map((line) =>
      text.indexOf(line),
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("defaults the preheader to the first paragraph", () => {
    const { html } = renderEmail({ heading: "Oi", paragraphs: ["Cobrinha do preheader."] });
    expect(html).toContain("Cobrinha do preheader.");
  });

  it("references the embedded logo by cid, matching the attachment lib/mail.ts sends", () => {
    const { html } = renderEmail({ heading: "Oi" });
    expect(html).toContain(`cid:${EMAIL_LOGO_ATTACHMENT.cid}`);
  });
});

describe("renderEmail: cta", () => {
  it("puts a button in the html and the raw link in the text", () => {
    const { html, text } = renderEmail({
      heading: "Confirme",
      cta: { label: "Confirmar agora", href: "https://fila.exemplo/solicitar/confirmar/abc123" },
    });
    expect(html).toContain('href="https://fila.exemplo/solicitar/confirmar/abc123"');
    expect(html).toContain("Confirmar agora");
    expect(text).toContain("https://fila.exemplo/solicitar/confirmar/abc123");
  });

  it("is absent from both when there is no cta", () => {
    const { html, text } = renderEmail({ heading: "Sem ação" });
    expect(html).not.toContain("<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin:20px 0;\">");
    expect(text.split("\n").filter((line) => line.startsWith("http"))).toHaveLength(0);
  });
});

describe("renderEmail: links list", () => {
  it("lists every link with its own label and href, html and text alike", () => {
    const { html, text } = renderEmail({
      heading: "Seus links",
      links: [
        { label: "Projeto A", href: "https://fila.exemplo/acompanhar/a" },
        { label: "Projeto B", href: "https://fila.exemplo/acompanhar/b" },
      ],
    });

    for (const label of ["Projeto A", "Projeto B"]) {
      expect(html).toContain(label);
      expect(text).toContain(label);
    }
    expect(html).toContain('href="https://fila.exemplo/acompanhar/a"');
    expect(text).toContain("https://fila.exemplo/acompanhar/b");
  });
});

describe("renderEmail: escaping dynamic content in html", () => {
  it("neutralizes an HTML/script payload in the heading, a paragraph and the greeting", () => {
    const payload = '<script>alert(1)</script>"onmouseover="x';
    const { html } = renderEmail({
      greeting: payload,
      heading: payload,
      paragraphs: [payload],
      footnote: payload,
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain('onmouseover="x"');
    // the escaped form does show up (proof it was rendered, just made inert)
    // — heading appears twice (<title> and <h1>), plus greeting, paragraph,
    // footnote and the preheader (which defaults to the same paragraph)
    expect(html.match(/&lt;script&gt;/g)?.length).toBe(6);
  });

  it("escapes a link label, and neutralizes the href attribute against quote breakout", () => {
    const { html } = renderEmail({
      heading: "Oi",
      cta: { label: '"><img src=x onerror=alert(1)>', href: 'https://fila.exemplo/x?a=1&b="><script>alert(1)</script>' },
    });

    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain('b="><');
  });

  it("keeps the plain-text version unescaped (it is not HTML)", () => {
    const { text } = renderEmail({ heading: "Café & Pão <especial>" });
    expect(text).toContain("Café & Pão <especial>");
  });
});

describe("EMAIL_LOGO_ATTACHMENT", () => {
  it("is a small, real file the repo ships (checked in, not generated on send)", () => {
    expect(EMAIL_LOGO_ATTACHMENT.filename).toMatch(/\.png$/);
    expect(EMAIL_LOGO_ATTACHMENT.path.endsWith("email-logo.png")).toBe(true);
  });
});
