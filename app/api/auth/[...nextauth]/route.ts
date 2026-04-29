import NextAuth, { type NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { authenticate } from "ldap-authentication"
import { Role } from "@prisma/client"

import { prisma } from "@/lib/prisma"

type LdapUser = {
  displayName?: string
  cn?: string
  name?: string
  mail?: string
  userPrincipalName?: string
  department?: string
}

// Required env vars:
// - NEXTAUTH_SECRET
// - NEXTAUTH_URL
// - LDAP_URL
// - LDAP_BASE_DN
// - LDAP_BIND_DN (optional)
// - LDAP_BIND_PASSWORD (optional)
// - LDAP_USER_SEARCH_FILTER (optional)
const authOptions: NextAuthOptions = {
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
        const login = credentials?.login?.trim()
        const password = credentials?.password

        if (!login || !password) {
          throw new Error("Credenciais invalidas")
        }

        try {
          const ldapUrl = process.env.LDAP_URL
          const baseDn = process.env.LDAP_BASE_DN

          if (!ldapUrl || !baseDn) {
            throw new Error("LDAP nao configurado")
          }

          const ldapUser = (await authenticate({
            ldapOpts: { url: ldapUrl },
            adminDn: process.env.LDAP_BIND_DN,
            adminPassword: process.env.LDAP_BIND_PASSWORD,
            userSearchBase: baseDn,
            usernameAttribute: "sAMAccountName",
            username: login,
            userPassword: password,
            userSearchFilter:
              process.env.LDAP_USER_SEARCH_FILTER ??
              "(sAMAccountName={{username}})",
          })) as LdapUser

          const name =
            ldapUser.displayName ?? ldapUser.cn ?? ldapUser.name ?? login
          const email = ldapUser.mail ?? ldapUser.userPrincipalName
          const department = ldapUser.department ?? ""

          if (!email) {
            throw new Error("Email nao encontrado no LDAP")
          }

          const existingUser = await prisma.user.findUnique({
            where: { login },
          })

          if (existingUser && !existingUser.isActive) {
            throw new Error("Usuario inativo")
          }

          if (existingUser) {
            return {
              id: existingUser.id,
              name: existingUser.name,
              email: existingUser.email,
              role: existingUser.role,
              department: existingUser.department,
            }
          }

          const createdUser = await prisma.user.create({
            data: {
              login,
              name,
              email,
              department,
              role: Role.REQUESTER,
            },
          })

          return {
            id: createdUser.id,
            name: createdUser.name,
            email: createdUser.email,
            role: createdUser.role,
            department: createdUser.department,
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : ""
          const normalized = message.toLowerCase()

          if (normalized.includes("connect") || normalized.includes("econn")) {
            throw new Error("Erro de conexao com o servidor de autenticacao")
          }

          if (message) {
            throw new Error(message)
          }

          throw new Error("Erro de autenticacao")
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.department = user.department
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role
        session.user.department = token.department
      }

      return session
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
