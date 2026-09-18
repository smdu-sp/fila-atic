"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { LoginLogo } from "@/app/login/_components/logo";

type LoginFormValues = {
  login: string;
  password: string;
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    defaultValues: {
      login: "",
      password: "",
    },
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await signIn("credentials", {
        login: values.login,
        password: values.password,
        redirect: false,
      });

      if (result?.error) {
        const message =
          result.error === "CredentialsSignin"
            ? "Credenciais invalidas."
            : result.error;
        toast.error(message || "Nao foi possivel autenticar.");
        return;
      }

      toast.success("Login realizado com sucesso.");
      router.push(callbackUrl);
    });
  });

  return (
    <Form
      onSubmit={onSubmit}
      className="p-6 md:p-8 dark:bg-muted bg-background"
    >
      <div className="flex flex-col gap-6">
        <LoginLogo />
        <div className="grid gap-2">
          <Field>
            <FieldLabel htmlFor="login">Login</FieldLabel>
            <FieldContent>
              <Input
                id="login"
                placeholder="RF ou usuario de rede"
                autoComplete="username"
                className="dark:bg-background bg-muted"
                {...register("login", { required: "Informe o login" })}
              />
              <FieldError errors={[errors.login]} />
            </FieldContent>
          </Field>
        </div>
        <div className="grid gap-2">
          <Field>
            <FieldLabel htmlFor="password">Senha</FieldLabel>
            <FieldContent>
              <Input
                id="password"
                type="password"
                placeholder="Sua senha"
                autoComplete="current-password"
                className="dark:bg-background bg-muted"
                {...register("password", { required: "Informe a senha" })}
              />
              <FieldError errors={[errors.password]} />
            </FieldContent>
          </Field>
        </div>
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Entrando..." : "Entrar"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Não tem acesso?{" "}
          <Link href="/solicitar" className="underline">
            Abra uma solicitação
          </Link>
        </p>
      </div>
    </Form>
  );
}
