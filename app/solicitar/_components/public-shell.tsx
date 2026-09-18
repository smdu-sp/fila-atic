import type { ReactNode } from "react";

import { LoginLogo } from "@/app/login/_components/logo";

// Layout of the pages reachable without an account (no sidebar, no session).
export function PublicShell({
  children,
  maxWidth = "max-w-2xl",
}: {
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="min-h-svh bg-muted">
      <div className={`mx-auto flex w-full flex-col gap-6 p-4 py-8 md:p-10 ${maxWidth}`}>
        <LoginLogo />
        {children}
      </div>
    </div>
  );
}
