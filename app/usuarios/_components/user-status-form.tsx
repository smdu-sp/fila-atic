"use client";

import { useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { updateUserStatus } from "@/actions/userActions";
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

const schema = z.object({
  isActive: z.enum(["true", "false"]),
});

type FormValues = z.infer<typeof schema>;

type UserStatusFormProps = {
  userId: string;
  defaultStatus: boolean;
};

export function UserStatusForm({ userId, defaultStatus }: UserStatusFormProps) {
  const [isPending, startTransition] = useTransition();
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { isActive: defaultStatus ? "true" : "false" },
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await updateUserStatus({
        userId,
        isActive: values.isActive === "true",
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("Status atualizado.");
    });
  });

  return (
    <Form onSubmit={onSubmit} className="grid gap-1.5">
      <Label htmlFor={`status-${userId}`}>Situação do acesso</Label>
      <div className="flex items-center gap-2">
      <Controller
        control={control}
        name="isActive"
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id={`status-${userId}`} className="flex-1">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Ativo</SelectItem>
              <SelectItem value="false">Inativo</SelectItem>
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
