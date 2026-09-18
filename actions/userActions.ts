"use server";

import { COORDINATION_ROLES, isCoordination } from "@/lib/roles";
import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type UpdateRoleInput = {
  userId: string;
  role: Role;
};

type UpdateStatusInput = {
  userId: string;
  isActive: boolean;
};

type CreateUserInput = {
  email: string;
  role: Role;
};

async function getUserOrError(): Promise<
  ActionResult<{ id: string; role: Role }>
> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Nao autenticado" };
  }

  return {
    success: true,
    data: { id: user.id, role: user.role },
  };
}

// Demoting or deactivating the only active coordinator (or tech lead, who has
// the same powers) would lock everyone out of user management.
async function isLastActiveCoordinator(userId: string) {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });

  if (!target || !isCoordination(target.role) || !target.isActive) return false;

  const others = await prisma.user.count({
    where: { role: { in: COORDINATION_ROLES }, isActive: true, id: { not: userId } },
  });

  return others === 0;
}

export async function listUsers(): Promise<
  ActionResult<
    Array<{
      id: string;
      name: string;
      login: string;
      email: string;
      department: string;
      role: Role;
      isActive: boolean;
    }>
  >
> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (!isCoordination(auth.data.role)) {
    return { success: false, error: "Sem permissao" };
  }

  const users = await prisma.user.findMany({
    where: { isGuest: false },
    select: {
      id: true,
      name: true,
      login: true,
      email: true,
      department: true,
      role: true,
      isActive: true,
    },
    orderBy: { name: "asc" },
  });

  return { success: true, data: users };
}

export async function updateUserRole(
  input: UpdateRoleInput,
): Promise<ActionResult<void>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (!isCoordination(auth.data.role)) {
    return { success: false, error: "Sem permissao" };
  }

  if (!input.userId || !Object.values(Role).includes(input.role)) {
    return { success: false, error: "Usuario invalido" };
  }

  const target = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true },
  });

  if (!target) {
    return { success: false, error: "Usuario nao encontrado" };
  }

  if (
    !isCoordination(input.role) &&
    (await isLastActiveCoordinator(input.userId))
  ) {
    return {
      success: false,
      error: "Deve existir ao menos um coordenador ativo",
    };
  }

  await prisma.user.update({
    where: { id: input.userId },
    data: { role: input.role },
  });

  revalidatePath("/usuarios");

  return { success: true, data: undefined };
}

export async function updateUserStatus(
  input: UpdateStatusInput,
): Promise<ActionResult<void>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (!isCoordination(auth.data.role)) {
    return { success: false, error: "Sem permissao" };
  }

  if (!input.userId) {
    return { success: false, error: "Usuario invalido" };
  }

  const target = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true },
  });

  if (!target) {
    return { success: false, error: "Usuario nao encontrado" };
  }

  if (!input.isActive && (await isLastActiveCoordinator(input.userId))) {
    return {
      success: false,
      error: "Deve existir ao menos um coordenador ativo",
    };
  }

  await prisma.user.update({
    where: { id: input.userId },
    data: { isActive: input.isActive },
  });

  revalidatePath("/usuarios");

  return { success: true, data: undefined };
}

export async function createUser(
  input: CreateUserInput,
): Promise<ActionResult<void>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (!isCoordination(auth.data.role)) {
    return { success: false, error: "Sem permissao" };
  }

  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { success: false, error: "Email invalido" };
  }

  if (!Object.values(Role).includes(input.role)) {
    return { success: false, error: "Perfil invalido" };
  }

  const exists = await prisma.user.findUnique({ where: { email } });

  // Someone who used the public form is a guest user; registering their
  // e-mail turns it into a regular account and keeps their requests.
  if (exists?.isGuest) {
    await prisma.user.update({
      where: { id: exists.id },
      data: { isGuest: false, isActive: true, role: input.role },
    });

    revalidatePath("/usuarios");

    return { success: true, data: undefined };
  }

  if (exists) {
    return { success: false, error: "Email ja cadastrado" };
  }

  await prisma.user.create({
    data: {
      email,
      role: input.role,
      login: email,
      name: email,
      department: "",
    },
  });

  revalidatePath("/usuarios");

  return { success: true, data: undefined };
}
