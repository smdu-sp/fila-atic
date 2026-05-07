"use client";

import Link from "next/link";
import {
  FileTextIcon,
  FolderIcon,
  LayoutIcon,
  ListIcon,
  UserIcon,
} from "lucide-react";

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
  },
  {
    title: "Fila de demandas",
    url: "/fila",
    icon: ListIcon,
  },
  {
    title: "Projetos",
    url: "/projetos",
    icon: FolderIcon,
  },
  {
    title: "Kanban",
    url: "/kanban",
    icon: LayoutIcon,
  },
];

const menuAdmin = [
  {
    title: "Usuarios",
    url: "/usuarios",
    icon: UserIcon,
  },
  {
    title: "Logs",
    url: "/logs",
    icon: FileTextIcon,
  },
];

export function NavMain() {
  return (
    <SidebarContent>
      <SidebarGroup className="space-y-2">
        <SidebarGroupLabel>Geral</SidebarGroupLabel>
        <SidebarMenu>
          {menuGeral.map((item) => (
            <SidebarMenuItem key={item.title} className="z-50">
              <SidebarMenuButton asChild tooltip={item.title}>
                <Link href={item.url}>
                  <item.icon className="size-4" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        <SidebarGroupLabel>Administracao</SidebarGroupLabel>
        <SidebarMenu>
          {menuAdmin.map((item) => (
            <SidebarMenuItem key={item.title} className="z-50">
              <SidebarMenuButton asChild tooltip={item.title}>
                <Link href={item.url}>
                  <item.icon className="size-4" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
  );
}
