"use client"

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { isMockDataMode } from "@/lib/data-mode";
import { FlaskConical, Loader2, ShieldAlert } from "lucide-react";

import { SidebarProvider } from "../ui/sidebar";
import { AppSidebar } from "@/components/sidebar/Sidebar";
import { AdminNavbar } from "@/components/admin/AdminNavbar";

type Props = {
    children: React.ReactNode;
};

export default function MainLayout({ children }: Props) {
    const pathname = usePathname();
    const router = useRouter();
    const { currentUser, isLoaded, invalidateSession } = useAuth();
    const currentUserId = currentUser?.id;

    useEffect(() => {
        if (!isLoaded) return;

        if (!currentUser) {
            router.replace("/login");
            return;
        }

        if (!isMockDataMode && currentUser.source !== "api") {
            invalidateSession();
            router.replace("/login");
        }
    }, [currentUser, invalidateSession, isLoaded, router]);

    useEffect(() => {
        if (!currentUserId) return;

        try {
            const channel = new BroadcastChannel("everprop_events");
            channel.onmessage = (event) => {
                if (event.data?.type === "LEAD_REASSIGNED" && event.data?.targetAgentId === currentUserId) {
                    toast.info(`Nuevo lead asignado: ${event.data.leadName}`, {
                        position: "top-center",
                        duration: 5000,
                    });
                }
            };
            return () => channel.close();
        } catch (e) {
            console.error(e);
        }
    }, [currentUserId]);

    useEffect(() => {
        if (!isMockDataMode || pathname !== "/admin") {
            return;
        }

        const scrollContainer = document.querySelector<HTMLElement>('[data-admin-scroll-container="true"]');
        if (!scrollContainer) {
            return;
        }

        const syncScrollTarget = () => {
            const hash = window.location.hash.replace(/^#/, "");

            if (!hash) {
                scrollContainer.scrollTo({ top: 0, behavior: "auto" });
                return;
            }

            if (hash === "settings") {
                scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: "smooth" });
                return;
            }

            const targetSection = document.getElementById(hash);
            targetSection?.scrollIntoView({ block: "start", behavior: "smooth" });
        };

        const animationFrameId = window.requestAnimationFrame(syncScrollTarget);
        window.addEventListener("hashchange", syncScrollTarget);

        return () => {
            window.cancelAnimationFrame(animationFrameId);
            window.removeEventListener("hashchange", syncScrollTarget);
        };
    }, [pathname]);

    if (!isLoaded || !currentUser || (!isMockDataMode && currentUser.source !== "api")) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white" role="status">
                <Loader2 className="mr-3 h-5 w-5 animate-spin text-blue-400" aria-hidden="true" />
                Verificando sesión…
            </div>
        );
    }

    return (
        <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
            <SidebarProvider defaultOpen>
                <div className="flex h-dvh w-full overflow-hidden">
                    <AppSidebar />
                    <div className="flex min-w-0 flex-1 flex-col">
                        <AdminNavbar />
                        <main data-admin-scroll-container="true" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto scroll-smooth bg-background p-3 sm:p-4 md:p-6">
                            <div className="mx-auto w-full max-w-[120rem] space-y-4">
                                {isMockDataMode && (
                                    <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="note">
                                        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                                        <div>
                                            <p className="font-bold">QA visual mock · datos no reales</p>
                                            <p className="mt-0.5 text-xs text-amber-800">Este entorno usa muestras locales y no confirma operaciones en EverProp.</p>
                                        </div>
                                    </div>
                                )}

                                {children}
                            </div>
                        </main>
                    </div>
                </div>
            </SidebarProvider>
        </div>
    );
}
