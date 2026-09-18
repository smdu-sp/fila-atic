import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@prisma/client";

import {
  createUser,
  listUsers,
  updateUserRole,
  updateUserStatus,
} from "@/actions/userActions";
import { authOptions, requireRole } from "@/lib/auth";
import { actAs, makeUser, prisma, resetDb } from "../helpers";

beforeEach(resetDb);

describe("user management", () => {
  it("is reserved to coordinators", async () => {
    const dev = await makeUser(Role.DEV_GLOBAL);
    actAs(dev);
    expect(await listUsers()).toMatchObject({ success: false });
    expect(await createUser({ email: "a@teste.gov.br", role: Role.REQUESTER })).toMatchObject({ success: false });
  });

  it("does not list guests", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    await makeUser(Role.REQUESTER, { isGuest: true });
    actAs(coord);

    const result = await listUsers();
    expect(result.success && result.data.map((u) => u.id)).toEqual([coord.id]);
  });

  it("never removes the last active coordinator", async () => {
    const only = await makeUser(Role.COORDINATOR);
    actAs(only);

    expect(await updateUserRole({ userId: only.id, role: Role.REQUESTER })).toMatchObject({ success: false });
    expect(await updateUserStatus({ userId: only.id, isActive: false })).toMatchObject({ success: false });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: only.id } })).role).toBe(Role.COORDINATOR);
  });

  it("allows demoting a coordinator when another active one exists", async () => {
    const a = await makeUser(Role.COORDINATOR);
    const b = await makeUser(Role.COORDINATOR);
    actAs(a);

    expect(await updateUserRole({ userId: b.id, role: Role.DEV_GLOBAL })).toMatchObject({ success: true });
    // now `a` is the last one again
    expect(await updateUserRole({ userId: a.id, role: Role.DEV_GLOBAL })).toMatchObject({ success: false });
  });

  it("validates roles and unknown users", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    actAs(coord);
    const target = await makeUser(Role.REQUESTER);

    expect(await updateUserRole({ userId: target.id, role: "ADMIN" as Role })).toMatchObject({ success: false });
    expect(await updateUserRole({ userId: "nao-existe", role: Role.REQUESTER })).toMatchObject({ success: false });
    expect(await createUser({ email: "x@teste.gov.br", role: "ADMIN" as Role })).toMatchObject({ success: false });
  });

  it("registering a guest's e-mail promotes the guest and keeps their requests", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    const guest = await makeUser(Role.REQUESTER, { email: "conv@teste.gov.br", isGuest: true });
    actAs(coord);

    expect(await createUser({ email: "CONV@teste.gov.br", role: Role.DEV_RESTRICTED })).toMatchObject({ success: true });

    const promoted = await prisma.user.findUniqueOrThrow({ where: { id: guest.id } });
    expect(promoted).toMatchObject({ isGuest: false, role: Role.DEV_RESTRICTED });
    expect(await prisma.user.count({ where: { email: "conv@teste.gov.br" } })).toBe(1);
  });

  it("rejects registering an e-mail that already has an account", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    await makeUser(Role.REQUESTER, { email: "dup@teste.gov.br" });
    actAs(coord);

    expect(await createUser({ email: "dup@teste.gov.br", role: Role.REQUESTER })).toMatchObject({ success: false });
  });
});

describe("sessions", () => {
  it("stops honoring a user right after they are deactivated or demoted", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    const other = await makeUser(Role.COORDINATOR);
    actAs(coord);

    expect(await listUsers()).toMatchObject({ success: true });

    await prisma.user.update({ where: { id: coord.id }, data: { role: Role.REQUESTER } });
    expect(await listUsers()).toMatchObject({ success: false });

    await prisma.user.update({ where: { id: coord.id }, data: { isActive: false } });
    actAs(coord);
    expect(await listUsers()).toMatchObject({ success: false, error: "Nao autenticado" });
    void other;
  });

  it("never treats a guest as signed in", async () => {
    const guest = await makeUser(Role.COORDINATOR, { isGuest: true });
    actAs(guest);
    expect(await listUsers()).toMatchObject({ success: false, error: "Nao autenticado" });
  });
});

describe("page guard", () => {
  it("redirects anonymous users to the login and other roles home", async () => {
    await expect(requireRole([Role.COORDINATOR])).rejects.toThrow("REDIRECT:/login");

    const requester = await makeUser(Role.REQUESTER);
    actAs(requester);
    await expect(requireRole([Role.COORDINATOR])).rejects.toThrow("REDIRECT:/");

    const coord = await makeUser(Role.COORDINATOR);
    actAs(coord);
    await expect(requireRole([Role.COORDINATOR])).resolves.toMatchObject({ id: coord.id });
  });
});

describe("credentials login (local mode)", () => {
  type Authorize = (c: { login: string; password: string }) => Promise<unknown>;
  const authorize = (authOptions.providers[0] as unknown as { options: { authorize: Authorize } })
    .options.authorize;

  it("signs in registered active users", async () => {
    const user = await makeUser(Role.DEV_GLOBAL, { email: "dev@teste.gov.br" });
    expect(await authorize({ login: "dev@teste.gov.br", password: "qualquer" })).toMatchObject({ id: user.id });
  });

  it("refuses guests, inactive users and unknown logins", async () => {
    await makeUser(Role.REQUESTER, { email: "guest@teste.gov.br", isGuest: true });
    await makeUser(Role.REQUESTER, { email: "off@teste.gov.br", isActive: false });

    await expect(authorize({ login: "guest@teste.gov.br", password: "x" })).rejects.toThrow(/nao cadastrado|não cadastrado/);
    await expect(authorize({ login: "off@teste.gov.br", password: "x" })).rejects.toThrow(/inativo/i);
    await expect(authorize({ login: "ninguem@teste.gov.br", password: "x" })).rejects.toThrow(/cadastrado/);
  });

  it("requires login and password", async () => {
    await expect(authorize({ login: "", password: "x" })).rejects.toThrow();
    await expect(authorize({ login: "a@teste.gov.br", password: "" })).rejects.toThrow();
  });
});
