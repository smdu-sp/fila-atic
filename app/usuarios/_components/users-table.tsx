"use client";

import { useMemo, useState } from "react";
import { Role } from "@prisma/client";
import { Plus, Pencil, RotateCw, Search, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserRoleForm } from "@/app/usuarios/_components/user-role-form";
import { UserStatusForm } from "@/app/usuarios/_components/user-status-form";
import { CreateUserForm } from "@/app/usuarios/_components/create-user-form";
import { roleLabels } from "@/lib/roles";

type UserRow = {
  id: string;
  name: string;
  login: string;
  email: string;
  department: string;
  role: Role;
  isActive: boolean;
};

type UsersTableProps = {
  users: UserRow[];
};

type FilterState = {
  search: string;
  status: "all" | "active" | "inactive";
  role: "all" | Role;
};

const roleLabelsLocal: Record<Role, string> = roleLabels;

export function UsersTable({ users }: UsersTableProps) {
  const [draft, setDraft] = useState<FilterState>({
    search: "",
    status: "all",
    role: "all",
  });
  const [applied, setApplied] = useState<FilterState>(draft);
  const [createOpen, setCreateOpen] = useState(false);

  const filteredUsers = useMemo(() => {
    const term = applied.search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch = term
        ? [user.name, user.login, user.email, user.department]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(term))
        : true;
      const matchesStatus =
        applied.status === "all"
          ? true
          : applied.status === "active"
            ? user.isActive
            : !user.isActive;
      const matchesRole =
        applied.role === "all" ? true : user.role === applied.role;

      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [applied, users]);

  const handleSearch = () => {
    setApplied(draft);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <InputGroup className="h-10 flex-1 min-w-[240px]">
          <InputGroupAddon align="inline-start">
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Digite o nome, email ou login"
            value={draft.search}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, search: event.target.value }))
            }
          />
        </InputGroup>
        <Select
          value={draft.status}
          onValueChange={(value) =>
            setDraft((prev) => ({
              ...prev,
              status: value as FilterState["status"],
            }))
          }
        >
          <SelectTrigger className="h-10 w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="inactive">Inativo</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={draft.role}
          onValueChange={(value) =>
            setDraft((prev) => ({
              ...prev,
              role: value as FilterState["role"],
            }))
          }
        >
          <SelectTrigger className="h-10 w-[200px]">
            <SelectValue placeholder="Permissao" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {Object.values(Role).map((role) => (
              <SelectItem key={role} value={role}>
                {roleLabelsLocal[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="h-10 gap-2" onClick={handleSearch}>
          <RotateCw />
          Buscar
        </Button>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="h-10 gap-2" variant="outline">
              <Plus />
              Cadastrar usuario
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo usuario</DialogTitle>
              <DialogDescription>
                Informe o email e a permissao de acesso.
              </DialogDescription>
            </DialogHeader>
            <CreateUserForm onCreated={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60 bg-background">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-primary text-primary-foreground">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold">Nome</th>
                <th className="px-4 py-3 font-semibold">Usuario</th>
                <th className="px-4 py-3 font-semibold">E-mail</th>
                <th className="px-4 py-3 font-semibold">Unidade</th>
                <th className="px-4 py-3 font-semibold">Permissão</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {user.name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {user.login}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {user.email}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {user.department}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">
                      {roleLabelsLocal[user.role]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={user.isActive ? "secondary" : "destructive"}
                    >
                      {user.isActive ? "ativo" : "inativo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <Pencil />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Editar usuario</DialogTitle>
                            <DialogDescription>
                              Atualize permissao e status de acesso.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4">
                            <UserRoleForm
                              userId={user.id}
                              defaultRole={user.role}
                            />
                            <UserStatusForm
                              userId={user.id}
                              defaultStatus={user.isActive}
                            />
                          </div>
                        </DialogContent>
                      </Dialog>
                      <Button variant="ghost" size="icon-sm" disabled>
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
          <span>
            1 a {filteredUsers.length} de {filteredUsers.length}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon-sm">
              1
            </Button>
            <Select value="10" onValueChange={() => null}>
              <SelectTrigger className="h-8 w-[72px]">
                <SelectValue placeholder="Itens" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
