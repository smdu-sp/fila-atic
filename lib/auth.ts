import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { authenticate } from "ldap-authentication";
import { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type LdapUser = {
  displayName?: string;
  cn?: string;
  name?: string;
  mail?: string;
  userPrincipalName?: string;
  department?: string;
};

// Required env vars:
// - NEXTAUTH_SECRET
// - NEXTAUTH_URL
// - LDAP_URL
// - LDAP_BASE_DN
// - LDAP_BIND_DN (optional)
// - LDAP_BIND_PASSWORD (optional)
//
// ENVIRONMENT=local skips LDAP and accepts any non-empty password, so it is
// only honored outside production builds.
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  providers: [
    CredentialsProvider({
      name: "LDAP",
      credentials: {
        login: { label: "Login", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const login = credentials?.login?.trim();
        const password = credentials?.password;
        const skipLdap =
          process.env.ENVIRONMENT?.toLowerCase() === "local" &&
          process.env.NODE_ENV !== "production";

        if (!login || !password) {
          throw new Error("Credenciais invalidas");
        }

        if (skipLdap) {
          const existingUser = await prisma.user.findFirst({
            where: {
              OR: [{ login }, { email: login }],
            },
          });

          if (!existingUser) {
            throw new Error(
              "Usuário não cadastrado no sistema, entre em contato com o suporte.",
            );
          }

          if (!existingUser.isActive) {
            throw new Error("Usuario inativo");
          }

          return {
            id: existingUser.id,
            name: existingUser.name,
            email: existingUser.email,
            role: existingUser.role,
            department: existingUser.department,
          };
        }

        try {
          const ldapUrl = process.env.LDAP_URL ?? process.env.LDAP_SERVER;
          const baseDn = process.env.LDAP_BASE_DN ?? process.env.LDAP_BASE;
          const adminDn =
            process.env.LDAP_BIND_DN ??
            (process.env.USER_LDAP
              ? `${process.env.USER_LDAP}${process.env.LDAP_DOMAIN ?? ""}`
              : undefined);
          const adminPassword =
            process.env.LDAP_BIND_PASSWORD ?? process.env.PASS_LDAP;

          if (!ldapUrl || !baseDn) {
            throw new Error("LDAP nao configurado");
          }

          const ldapUser = (await authenticate({
            ldapOpts: { url: ldapUrl },
            adminDn,
            adminPassword,
            userSearchBase: baseDn,
            usernameAttribute: "sAMAccountName",
            username: login,
            userPassword: password,
          })) as LdapUser;

          const name =
            ldapUser.displayName ?? ldapUser.cn ?? ldapUser.name ?? login;
          const email = ldapUser.mail ?? ldapUser.userPrincipalName;
          const department = ldapUser.department ?? "";

          if (!email) {
            throw new Error("Email nao encontrado no LDAP");
          }

          const existingUser = await prisma.user.findUnique({
            where: { email },
          });

          if (!existingUser) {
            throw new Error(
              "Usuário não cadastrado no sistema, entre em contato com o suporte.",
            );
          }

          if (!existingUser.isActive) {
            throw new Error("Usuario inativo");
          }

          const needsUpdate =
            existingUser.login !== login ||
            existingUser.name !== name ||
            existingUser.department !== department;

          const updatedUser = needsUpdate
            ? await prisma.user.update({
                where: { id: existingUser.id },
                data: {
                  login,
                  name,
                  department,
                },
              })
            : existingUser;

          return {
            id: updatedUser.id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            department: updatedUser.department,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          const normalized = message.toLowerCase();

          if (normalized.includes("connect") || normalized.includes("econn")) {
            throw new Error("Erro de conexao com o servidor de autenticacao");
          }

          if (
            normalized.includes("invalid credentials") ||
            normalized.includes("invalid password") ||
            normalized.includes("invalid user") ||
            normalized.includes("invalid") ||
            normalized.includes("data 52e")
          ) {
            throw new Error("Credenciais invalidas");
          }

          if (message) {
            throw new Error(message);
          }

          throw new Error("Erro de autenticacao");
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.department = user.department;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.department = token.department;
      }

      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export async function getServerAuthSession() {
  return getServerSession(authOptions);
}

export type CurrentUser = {
  id: string;
  role: Role;
  name: string;
  email: string;
};

// The JWT keeps the role from login time, so authorization checks reload the
// user to honor role changes and deactivation right away.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, name: true, email: true, isActive: true },
  });

  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    role: user.role,
    name: user.name || user.email,
    email: user.email,
  };
}
