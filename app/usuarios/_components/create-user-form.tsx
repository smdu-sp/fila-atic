"use client";

import { useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Role } from "@prisma/client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { createUser } from "@/actions/userActions";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { roleLabels } from "@/lib/roles";

const schema = z.object({
  email: z.string().email("Informe um email valido"),
  role: z.nativeEnum(Role),
});

type FormValues = z.infer<typeof schema>;

type CreateUserFormProps = {
  onCreated?: () => void;
};

export function CreateUserForm({ onCreated }: CreateUserFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { control, handleSubmit, register, formState, reset } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        email: "",
        role: Role.REQUESTER,
      },
    });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await createUser({
        email: values.email,
        role: values.role,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("Usuario cadastrado.");
      reset();
      router.refresh();
      onCreated?.();
    });
  });

  return (
    <Form onSubmit={onSubmit} className="grid gap-4">
      <Field>
        <FieldLabel htmlFor="user-email">Email</FieldLabel>
        <FieldContent>
          <Input
            id="user-email"
            placeholder="usuario@dominio.gov.br"
            {...register("email")}
          />
          <FieldError errors={[formState.errors.email]} />
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel>Permissao</FieldLabel>
        <FieldContent>
          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Permissao" />
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
          <FieldError errors={[formState.errors.role]} />
        </FieldContent>
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando" : "Cadastrar"}
        </Button>
      </DialogFooter>
    </Form>
  );
}
