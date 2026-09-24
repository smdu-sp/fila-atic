import { Role } from "@prisma/client";

export const roleLabels: Record<Role, string> = {
  COORDINATOR: "Coordenador",
  TECH_LEAD: "Tech Lead",
  REQUESTER: "Solicitante",
  DEV_RESTRICTED: "DEV I",
  DEV_GLOBAL: "DEV II",
};

export function getRoleLabel(role: Role) {
  return roleLabels[role] ?? role;
}

// Tech leads have exactly the permissions of coordinators. Every check that
// used to test for COORDINATOR goes through these, so the two roles can never
// drift apart.
export const COORDINATION_ROLES: Role[] = [Role.COORDINATOR, Role.TECH_LEAD];

export const isCoordination = (role: Role | null | undefined): boolean =>
  role != null && COORDINATION_ROLES.includes(role);

// Who may manage projects and tasks of any project: coordination and DEV II.
export const isManagerRole = (role: Role | null | undefined): boolean =>
  isCoordination(role) || role === Role.DEV_GLOBAL;

// Everyone who works here, as opposed to a requester (internal or public):
// who may see and edit the internal wiki, for instance.
export const STAFF_ROLES: Role[] = [
  Role.DEV_RESTRICTED,
  Role.DEV_GLOBAL,
  ...COORDINATION_ROLES,
];

export const isStaffRole = (role: Role | null | undefined): boolean =>
  role != null && STAFF_ROLES.includes(role);

// Who can be put on a project team and own tasks: the developers and the tech
// lead, who also writes code. Coordinators manage the work but are not
// assigned to it, and requesters never are.
export const ASSIGNABLE_ROLES: Role[] = [
  Role.DEV_RESTRICTED,
  Role.DEV_GLOBAL,
  Role.TECH_LEAD,
];

export const isAssignableRole = (role: Role | null | undefined): boolean =>
  role != null && ASSIGNABLE_ROLES.includes(role);
