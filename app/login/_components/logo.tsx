import Image from "next/image";

import smulLight from "@/public/smul_azul.png";
import smulDark from "@/public/smul_branco.png";

export function LoginLogo() {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="relative h-14 w-40">
        <Image
          src={smulLight}
          alt="SMUL"
          className="h-full w-full object-contain dark:hidden"
          priority
        />
        <Image
          src={smulDark}
          alt="SMUL"
          className="hidden h-full w-full object-contain dark:block"
          priority
        />
      </div>
      <div>
        <p className="text-lg font-semibold">FilaAtic</p>
        <p className="text-xs text-muted-foreground">
          Secretaria Municipal de Urbanismo
        </p>
      </div>
    </div>
  );
}
