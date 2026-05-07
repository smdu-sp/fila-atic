import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const stats = [
  {
    title: "Na fila",
    value: "18",
    description: "Pedidos aguardando triagem",
  },
  {
    title: "Em analise",
    value: "7",
    description: "Demandas em validacao",
  },
  {
    title: "Em desenvolvimento",
    value: "12",
    description: "Projetos ativos",
  },
  {
    title: "Finalizados",
    value: "35",
    description: "Entregas concluidas",
  },
];

const recent = [
  {
    title: "Portal de Licencas",
    status: "Em analise",
    owner: "Coordenadoria 1",
  },
  {
    title: "Painel de Indicadores",
    status: "Em desenvolvimento",
    owner: "ATIC",
  },
  {
    title: "Atualizacao de API",
    status: "Na fila",
    owner: "TI Central",
  },
];

export default function Page() {
  return (
    <div className="relative w-full overflow-x-hidden">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <header className="hidden h-16 shrink-0 items-center gap-2 bg-muted/50 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 sm:flex">
            <div className="flex items-center gap-2 px-3 sm:px-4">
              <SidebarTrigger className="-ml-1 md:hidden" />
              <Separator
                orientation="vertical"
                className="mr-2 h-4 md:ml-[-16px]"
              />
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">FilaAtic</span>
                <span className="text-sm font-semibold">Dashboard</span>
              </div>
            </div>
          </header>
          <div className="w-full min-w-0 bg-muted/50 p-4 pt-6 sm:gap-4 sm:p-6 sm:pt-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold">Visao geral</h1>
              <p className="text-sm text-muted-foreground">
                Acompanhe o fluxo de demandas e prioridades da ATIC.
              </p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {stats.map((item) => (
                <Card key={item.title}>
                  <CardHeader className="pb-2">
                    <CardDescription>{item.title}</CardDescription>
                    <CardTitle className="text-3xl">{item.value}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    {item.description}
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Demandas em destaque</CardTitle>
                  <CardDescription>
                    Ultimas solicitacoes e prioridades da semana.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {recent.map((item) => (
                    <div
                      key={item.title}
                      className="flex flex-col gap-2 rounded-lg border border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.owner}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                          {item.status}
                        </span>
                        <Button size="sm" variant="outline">
                          Ver detalhes
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Resumo rapido</CardTitle>
                  <CardDescription>
                    Indicadores chave do backlog atual.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span>Prioridade alta</span>
                    <span className="font-semibold">6</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Revalidacao pendente</span>
                    <span className="font-semibold">3</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Em homologacao</span>
                    <span className="font-semibold">4</span>
                  </div>
                  <Button className="w-full">Nova solicitacao</Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
