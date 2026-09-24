import { getNotebookPage, listNotebookTree } from "@/actions/notebookActions";
import { NotebookView } from "@/app/wiki/_components/notebook-view";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireRole } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/roles";

export default async function WikiPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await requireRole(STAFF_ROLES);

  const { p } = await searchParams;
  const [treeResult, pageResult] = await Promise.all([
    listNotebookTree(),
    p ? getNotebookPage(p) : Promise.resolve(null),
  ]);

  const tree = treeResult.success ? treeResult.data : [];
  const page = pageResult?.success ? pageResult.data : null;

  return (
    <div className="relative w-full overflow-x-hidden">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <PageHeader title="Wiki" />
          <div className="grid w-full min-w-0 gap-6 p-4 pt-6 sm:p-6 sm:pt-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold">Wiki</h1>
              <p className="text-sm text-muted-foreground">
                Wiki interna da equipe: templates, informações de servidores e o
                que mais for útil manter registrado.
              </p>
            </div>
            {!treeResult.success ? (
              <p className="text-sm text-destructive">{treeResult.error}</p>
            ) : null}
            {p && pageResult && !pageResult.success ? (
              <p className="text-sm text-destructive">{pageResult.error}</p>
            ) : null}
            <NotebookView tree={tree} page={page} />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
