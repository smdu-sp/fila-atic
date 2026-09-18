import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/app/providers";

const sora = Sora({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Fila Atic",
  description: "Fila de projetos de ATIC",
  icons: {
    icon: [
      { url: "/smul_icone_azul.png", media: "(prefers-color-scheme: light)" },
      { url: "/smul_icone_branco.png", media: "(prefers-color-scheme: dark)" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${sora.variable} antialiased`}
    >
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
