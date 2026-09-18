import { vi } from "vitest";

// Server actions run outside a Next request here, so the framework pieces
// they touch are replaced. Everything else (Prisma, the database, the action
// code itself) is real.

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "10.0.0.1" }),
}));

// redirect() throws in Next; keep that behavior so guards can be asserted.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

// The current session comes from getServerSession; tests choose it with
// actAs() in tests/helpers.ts.
vi.mock("next-auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-auth")>();
  return { ...original, getServerSession: vi.fn() };
});

vi.mock("@/lib/mail", () => ({ sendMail: vi.fn(async () => undefined) }));
