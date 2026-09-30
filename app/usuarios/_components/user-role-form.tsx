"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Role } from "@prisma/client";

import { updateUserRole } from "@/actions/userActions";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { roleLabels } from "@/lib/roles";

const schema = z.object({
  role: z.nativeEnum(Role),
});

type FormValues = z.infer<typeof schema>;

type UserRoleFormProps = {
  userId: string;
  defaultRole: Role;
};

export function UserRoleForm({ userId, defaultRole }: UserRoleFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: defaultRole },
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await updateUserRole({ userId, role: values.role });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Role atualizada.");
      router.refresh();
    });
  });

  return (
    <Form onSubmit={onSubmit} className="grid gap-1.5">
      <Label htmlFor={`role-${userId}`}>Permissão de acesso</Label>
      <div className="flex items-center gap-2">
      <Controller
        control={control}
        name="role"
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id={`role-${userId}`} className="flex-1">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              {Object.values(Role).map((role) => (
                <SelectItem key={role} value={role}>
                  {roleLabels[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Salvando" : "Salvar"}
      </Button>
      </div>
    </Form>
  );
}
