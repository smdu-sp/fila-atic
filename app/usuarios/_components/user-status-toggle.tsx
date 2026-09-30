"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";

import { updateUserStatus } from "@/actions/userActions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type UserStatusToggleProps = {
  userId: string;
  name: string;
  isActive: boolean;
};

export function UserStatusToggle({
  userId,
  name,
  isActive,
}: UserStatusToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const toggle = () => {
    startTransition(async () => {
      const result = await updateUserStatus({ userId, isActive: !isActive });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(isActive ? "Usuario inativado." : "Usuario ativado.");
      router.refresh();
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={isPending}
          title={isActive ? "Inativar usuario" : "Ativar usuario"}
        >
          {isActive ? (
            <UserX className="text-destructive" />
          ) : (
            <UserCheck className="text-emerald-600" />
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isActive ? `Inativar "${name}"?` : `Ativar "${name}"?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isActive
              ? "O usuario perde acesso ao sistema ate ser ativado novamente."
              : "O usuario volta a ter acesso ao sistema."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={toggle}>
            {isActive ? "Inativar" : "Ativar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
