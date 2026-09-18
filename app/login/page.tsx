import { Suspense } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { LoginBackground } from "@/app/login/_components/background";
import { LoginForm } from "@/app/login/_components/login-form";
import { LoginSidePanel } from "@/app/login/_components/side-panel";

export default function LoginPage() {
  return (
    <div className="relative min-h-svh bg-muted">
      <LoginBackground />
      <div className="relative z-10 flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm md:max-w-3xl">
          <Card className="overflow-hidden py-0">
            <CardContent className="relative grid p-0 md:grid-cols-2">
              <Suspense>
                <LoginForm />
              </Suspense>
              <LoginSidePanel />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
