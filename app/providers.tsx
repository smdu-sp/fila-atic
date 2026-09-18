"use client";

import type { ReactNode } from "react";

import { SessionProvider } from "next-auth/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SonnerToaster } from "@/components/ui/sonner";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <TooltipProvider delayDuration={0}>
        {children}
        <SonnerToaster />
      </TooltipProvider>
    </SessionProvider>
  );
}
