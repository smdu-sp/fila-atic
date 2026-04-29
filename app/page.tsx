import { AppSidebar } from "@/components/app-sidebar";
import { ComponentExample } from "@/components/component-example";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function Page() {
return (
    <TooltipProvider>
        <SidebarProvider>
            <AppSidebar variant="inset" />
            <SidebarInset>
            </SidebarInset>
        </SidebarProvider>
    </TooltipProvider>
);
}