import Image from "next/image";

import day from "@/public/martinelli_dia.jpg";
import night from "@/public/martinelli_noite.jpeg";

export function LoginBackground() {
  return (
    <div className="absolute inset-0 md:hidden">
      <Image
        src={day}
        alt="Edificio Martinelli"
        className="absolute inset-0 h-full w-full object-cover dark:hidden"
        priority
      />
      <Image
        src={night}
        alt="Edificio Martinelli"
        className="absolute inset-0 hidden h-full w-full object-cover dark:block"
        priority
      />
    </div>
  );
}
