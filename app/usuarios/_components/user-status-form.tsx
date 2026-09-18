"use client";

import { useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { updateUserStatus } from "@/actions/userActions";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
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
    <Form onSubmit={onSubmit} className="flex flex-wrap gap-2">
      <Controller
        control={control}
        name="isActive"
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger className="w-[130px]" size="sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Ativo</SelectItem>
              <SelectItem value="false">Inativo</SelectItem>
            </SelectContent>
          </Select>
        )}
      />
      <Button size="sm" type="submit" disabled={isPending}>
        {isPending ? "Salvando" : "Salvar"}
      </Button>
    </Form>
  );
}
