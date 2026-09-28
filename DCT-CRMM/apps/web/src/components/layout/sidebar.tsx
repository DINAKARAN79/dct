"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/auth-context";
import {
  LayoutDashboard,
  Users,
  Contact,
  Building2,
  MapPin,
  TrendingUp,
  FileText,
  CalendarCheck,
  CreditCard,
  FolderKanban,
  CheckSquare,
  BarChart3,
  Settings,
  ChevronRight,
  X,
} from "lucide-react";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

function getNavigationByProfile(
  profileName: string | undefined,
  roles: string[],
  hasEffectivePermission: (perm: string) => boolean,
  isSuperAdmin: boolean,
  isAdmin: boolean,
): NavItem[] {
  const showAdminSection = isSuperAdmin || isAdmin;
  void profileName;
  void roles;

  const allItems: NavItem[] = [
    { title: "Home", href: "/dashboard", icon: LayoutDashboard },
  ];

  if (isSuperAdmin) {
    allItems.push({
      title: "Companies",
      href: "/admin/companies",
      icon: Building2,
    });
  }

  allItems.push(
    { title: "Leads", href: "/leads", icon: Contact },
    { title: "Site Visits", href: "/site-visits", icon: MapPin },
    { title: "Opportunities", href: "/opportunities", icon: TrendingUp },
    { title: "Quotations", href: "/quotations", icon: FileText },
    { title: "Bookings", href: "/bookings", icon: CalendarCheck },
    { title: "Payments", href: "/payments", icon: CreditCard },
    { title: "Projects", href: "/projects", icon: FolderKanban },
    { title: "Tasks", href: "/tasks", icon: CheckSquare },
    { title: "Dashboards", href: "/dashboards", icon: LayoutDashboard },
    { title: "Reports", href: "/reports", icon: BarChart3 },
  );

  if (showAdminSection) {
    allItems.push({ title: "Setup Home", href: "/setup", icon: Settings });
    return allItems;
  }

  const nav: NavItem[] = [
    { title: "Home", href: "/dashboard", icon: LayoutDashboard },
  ];

  if (hasEffectivePermission("LEAD_READ")) {
    nav.push({ title: "Leads", href: "/leads", icon: Contact });
  }
  if (hasEffectivePermission("SITE_VISIT_READ")) {
    nav.push({ title: "Site Visits", href: "/site-visits", icon: MapPin });
  }
  if (hasEffectivePermission("OPPORTUNITY_READ")) {
    nav.push({
      title: "Opportunities",
      href: "/opportunities",
      icon: TrendingUp,
    });
  }
  if (hasEffectivePermission("QUOTATION_READ")) {
    nav.push({ title: "Quotations", href: "/quotations", icon: FileText });
  }
  if (hasEffectivePermission("BOOKING_READ")) {
    nav.push({ title: "Bookings", href: "/bookings", icon: CalendarCheck });
  }
  if (hasEffectivePermission("PAYMENT_READ")) {
    nav.push({ title: "Payments", href: "/payments", icon: CreditCard });
  }
  if (hasEffectivePermission("PROJECT_READ")) {
    nav.push({ title: "Projects", href: "/projects", icon: FolderKanban });
  }
  if (hasEffectivePermission("TASK_READ")) {
    nav.push({ title: "Tasks", href: "/tasks", icon: CheckSquare });
  }
  if (hasEffectivePermission("DASHBOARD_READ")) {
    nav.push({
      title: "Dashboards",
      href: "/dashboards",
      icon: LayoutDashboard,
    });
  }
  if (hasEffectivePermission("REPORT_VIEW")) {
    nav.push({ title: "Reports", href: "/reports", icon: BarChart3 });
  }

  return nav;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const {
    profile,
    roles,
    hasEffectivePermission,
    isSuperAdmin,
    isAdmin,
    tenant,
  } = useAuth();

  const navigation = getNavigationByProfile(
    profile?.name,
    roles,
    hasEffectivePermission,
    isSuperAdmin,
    isAdmin,
  );

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/80 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transition-transform duration-300 ease-in-out lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-4 border-b">
          <Link href="/dashboard" className="flex items-center gap-2">
            {tenant && (tenant as any).logo ? (
              <img
                src={`/api/proxy/api/super-admin/logos/${(tenant as any).logo}`}
                alt={tenant.name}
                className="h-8 w-8 rounded object-cover"
              />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">
                  DCT
                </span>
              </div>
            )}
            <span className="font-bold text-lg">
              {isSuperAdmin ? "CRM" : tenant?.name || "CRM"}
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="lg:hidden"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <ScrollArea className="h-[calc(100vh-4rem)] py-4">
          <nav className="space-y-1 px-3">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  isActive(item.href)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
                {isActive(item.href) && (
                  <ChevronRight className="ml-auto h-4 w-4" />
                )}
              </Link>
            ))}
          </nav>
        </ScrollArea>
      </aside>
    </>
  );
}
