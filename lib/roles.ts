import { Role } from "@prisma/client";

export const roleLabels: Record<Role, string> = {
  COORDINATOR: "Coordenador",
  REQUESTER: "Solicitante",
  DEV_RESTRICTED: "DEV I",
  DEV_GLOBAL: "DEV II",
};

export function getRoleLabel(role: Role) {
  return roleLabels[role] ?? role;
}
