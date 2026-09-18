"use client";

import { COORDINATION_ROLES } from "@/lib/roles";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  FileTextIcon,
  FolderIcon,
  LayoutIcon,
  ListIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react";
import { Role } from "@prisma/client";

import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const menuGeral = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutIcon,
    roles: [
      Role.REQUESTER,
      Role.DEV_RESTRICTED,
      Role.DEV_GLOBAL,
      ...COORDINATION_ROLES,
    ],
  },
  {
    title: "Fila de demandas",
    url: "/fila",
    icon: ListIcon,
    roles: COORDINATION_ROLES,
  },
  {
    title: "Projetos",
    url: "/projetos",
    icon: FolderIcon,
    roles: [Role.DEV_RESTRICTED, Role.DEV_GLOBAL, ...COORDINATION_ROLES],
  },
  {
    title: "Kanban",
    url: "/kanban",
    icon: LayoutIcon,
    roles: [Role.DEV_RESTRICTED, Role.DEV_GLOBAL, ...COORDINATION_ROLES],
  },
];

const menuAdmin = [
  {
    title: "Usuários",
    url: "/usuarios",
    icon: UserIcon,
    roles: COORDINATION_ROLES,
  },
  {
    title: "Configurar formulário",
    url: "/administracao/solicitacao",
    icon: SettingsIcon,
    roles: COORDINATION_ROLES,
  },
  {
    title: "Logs",
    url: "/logs",
    icon: FileTextIcon,
    roles: [Role.DEV_RESTRICTED, Role.DEV_GLOBAL, ...COORDINATION_ROLES],
  },
];

export function NavMain() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isActivePath = (url: string) =>
    url === "/" ? pathname === "/" : pathname.startsWith(url);
  const canSee = (roles: Role[]) => (role ? roles.includes(role) : false);
  const generalItems = menuGeral.filter((item) => canSee(item.roles));
  const adminItems = menuAdmin.filter((item) => canSee(item.roles));

  return (
    <SidebarContent>
      <SidebarGroup className="space-y-2">
        <SidebarGroupLabel>Geral</SidebarGroupLabel>
        <SidebarMenu>
          {generalItems.map((item) => (
            <SidebarMenuItem key={item.title} className="z-50">
              <SidebarMenuButton
                asChild
                tooltip={item.title}
                isActive={isActivePath(item.url)}
              >
                <Link href={item.url}>
                  <item.icon className="size-4" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        {adminItems.length ? (
          <>
            <SidebarGroupLabel>Administracao</SidebarGroupLabel>
            <SidebarMenu>
              {adminItems.map((item) => (
                <SidebarMenuItem key={item.title} className="z-50">
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={isActivePath(item.url)}
                  >
                    <Link href={item.url}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </>
        ) : null}
      </SidebarGroup>
    </SidebarContent>
  );
}
