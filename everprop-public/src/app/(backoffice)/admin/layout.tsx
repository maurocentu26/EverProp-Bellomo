import AdminMainLayout from "@/components/admin/MainLayout";
import { DashboardModeProvider } from "@/lib/dashboard-context";

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardModeProvider>
      <AdminMainLayout>{children}</AdminMainLayout>
    </DashboardModeProvider>
  );
}
