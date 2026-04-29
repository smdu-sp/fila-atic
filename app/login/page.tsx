"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type LoginFormValues = {
  login: string;
  password: string;
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
    setErrorMessage(null);

    startTransition(async () => {
      const result = await signIn("credentials", {
        login: values.login,
        password: values.password,
        redirect: false,
      });

      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }

      router.push(callbackUrl);
    });
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Acesso ao FilaAtic</CardTitle>
          <CardDescription>
            Entre com seu RF ou usuario de rede da prefeitura.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form onSubmit={onSubmit}>
            <Field>
              <FieldLabel htmlFor="login">Login</FieldLabel>
              <FieldContent>
                <Input
                  id="login"
                  placeholder="RF ou usuario de rede"
                  autoComplete="username"
                  {...register("login", { required: "Informe o login" })}
                />
                <FieldError errors={[errors.login]} />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="password">Senha</FieldLabel>
              <FieldContent>
                <Input
                  id="password"
                  type="password"
                  placeholder="Sua senha"
                  autoComplete="current-password"
                  {...register("password", { required: "Informe a senha" })}
                />
                <FieldError errors={[errors.password]} />
              </FieldContent>
            </Field>

            {errorMessage ? (
              <p className="text-sm text-destructive" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <Button type="submit" disabled={isPending}>
              {isPending ? "Entrando..." : "Entrar"}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
