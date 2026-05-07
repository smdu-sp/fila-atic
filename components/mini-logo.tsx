import Image from "next/image";

import iconLight from "@/public/smul_icone_azul.png";
import iconDark from "@/public/smul_icone_branco.png";

export function MiniLogo() {
  return (
    <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-sidebar-primary-foreground">
      <Image
        src={iconLight}
        alt="SMUL"
        className="h-6 w-6 object-contain dark:hidden"
      />
      <Image
        src={iconDark}
        alt="SMUL"
        className="hidden h-6 w-6 object-contain dark:block"
      />
    </div>
  );
}
