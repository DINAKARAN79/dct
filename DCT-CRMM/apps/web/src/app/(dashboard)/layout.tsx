"use client";

import * as React from "react";import { usePathname } from "next/navigation";import { AuthProvider } from "@/contexts/auth-context";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Chatbot } from "@/components/ai/chatbot";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

function ImpersonationBanner() {
  const { user, stopImpersonating } = useAuth();
  if (!user?.impersonatedBy) return null;

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <span>You are logged in as <strong>{user.firstName} {user.lastName}</strong>.</span>
      <Button size="sm" variant="outline" onClick={() => void stopImpersonating()}>
        <LogOut className="mr-2 h-4 w-4" />
        Return to admin
      </Button>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const pathname = usePathname();
  const hideBreadcrumb = pathname === "/reports" || pathname.startsWith("/reports/");

  return (
    <AuthProvider>
      <div className="min-h-screen bg-background">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="lg:pl-64">
          <Header onMenuClick={() => setSidebarOpen(true)} />
          <main className="p-4 md:p-6">
            {!hideBreadcrumb && <Breadcrumb className="mb-4" />}
            <ImpersonationBanner />
            {children}
          </main>
        </div>
        <Chatbot />
        <Toaster />
      </div>
    </AuthProvider>
  );
}
