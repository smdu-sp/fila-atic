import Image from "next/image";

import day from "@/public/martinelli_dia.jpg";
import night from "@/public/martinelli_noite.jpeg";

export function LoginSidePanel() {
  return (
    <div className="relative hidden bg-muted md:block">
      <Image
        src={day}
        alt="Edificio Martinelli"
        className="absolute inset-0 h-full w-full object-cover dark:hidden"
      />
      <Image
        src={night}
        alt="Edificio Martinelli"
        className="absolute inset-0 hidden h-full w-full object-cover dark:block"
      />
      <div className="relative z-10 flex h-full flex-col justify-between p-6 text-sm"></div>
    </div>
  );
}
