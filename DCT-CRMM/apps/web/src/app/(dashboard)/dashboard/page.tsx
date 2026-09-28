"use client";

import { formatDate, formatDateTime } from "@/lib/date-format";

import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Button } from "@/components/ui/button";

import { Skeleton } from "@/components/ui/skeleton";

import { KPICard, PipelineSummary } from "@/components/crm/dashboard-widgets";

import {
  Users,
  TrendingUp,
  DollarSign,
  FileText,
  Calendar,
  Plus,
  ArrowRight,
} from "lucide-react";

import Link from "next/link";

import { analyticsApi, opportunityApi, taskApi, activityApi } from "@/lib/api";

function formatAmount(amount: number) {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount}`;
}

function getActivityTypeColor(type: string) {
  switch (type?.toLowerCase()) {
    case "call":
      return "bg-blue-100 text-blue-800";
    case "meeting":
      return "bg-green-100 text-green-800";
    case "email":
      return "bg-purple-100 text-purple-800";
    case "note":
      return "bg-yellow-100 text-yellow-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function getPriorityColor(priority: string) {
  switch (priority?.toLowerCase()) {
    case "high":
    case "urgent":
      return "bg-red-500";
    case "medium":
      return "bg-yellow-500";
    default:
      return "bg-green-500";
  }
}

function formatTimeAgo(dateStr: string) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function LegacyDashboardPage() {
  const [kpis, setKpis] = React.useState<any[]>([]);
  const [pipelineStages, setPipelineStages] = React.useState<any[]>([]);
  const [recentOpportunities, setRecentOpportunities] = React.useState<any[]>(
    [],
  );
  const [upcomingTasks, setUpcomingTasks] = React.useState<any[]>([]);
  const [recentActivities, setRecentActivities] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchDashboardData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [
        leadsRes,
        oppRes,
        pipelineRes,
        tasksRes,
        activitiesRes,
        recentOppRes,
      ] = await Promise.allSettled([
        analyticsApi.getLeads(),
        analyticsApi.getOpportunities(),
        analyticsApi.getPipeline(),
        taskApi.list({ limit: 5, sortBy: "dueDate", sortOrder: "asc" }),
        activityApi.list({ limit: 5 }),
        opportunityApi.list({
          limit: 3,
          sortBy: "createdAt",
          sortOrder: "desc",
        }),
      ]);

      const leadsData =
        leadsRes.status === "fulfilled" ? leadsRes.value.data?.data : null;
      const oppData =
        oppRes.status === "fulfilled" ? oppRes.value.data?.data : null;
      const pipelineData =
        pipelineRes.status === "fulfilled"
          ? pipelineRes.value.data?.data
          : null;
      const tasksData =
        tasksRes.status === "fulfilled" ? tasksRes.value.data?.data : [];
      const activitiesData =
        activitiesRes.status === "fulfilled"
          ? activitiesRes.value.data?.data
          : [];

      setKpis([
        {
          title: "Total Leads",
          value: leadsData?.total ?? 0,
          icon: Users,
        },
        {
          title: "Opportunities",
          value: oppData?.total ?? 0,
          icon: TrendingUp,
        },
        {
          title: "Pipeline Value",
          value: `₹${((pipelineData?.totalPipeline ?? 0) / 100000).toFixed(1)}L`,
          icon: DollarSign,
        },
        {
          title: "Active Tasks",
          value: Array.isArray(tasksData) ? tasksData.length : 0,
          icon: FileText,
        },
      ]);

      if (pipelineData?.stages) {
        setPipelineStages(
          pipelineData.stages
            .filter(
              (s: any) => !["CLOSED_WON", "CLOSED_LOST"].includes(s.stage),
            )
            .map((s: any) => ({
              name: s.stage.toLowerCase(),
              count: s.count,
              value: s.amount,
            })),
        );
      }

      const recentOppData =
        recentOppRes.status === "fulfilled"
          ? recentOppRes.value.data?.data
          : [];
      if (Array.isArray(recentOppData)) {
        setRecentOpportunities(recentOppData.slice(0, 3));
      }

      if (Array.isArray(tasksData)) {
        setUpcomingTasks(tasksData.slice(0, 3));
      }

      if (Array.isArray(activitiesData)) {
        setRecentActivities(activitiesData.slice(0, 4));
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Executive Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back! Here&apos;s what&apos;s happening today.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/reports">View Reports</Link>
          </Button>
          <Button asChild>
            <Link href="/leads/new">
              <Plus className="mr-2 h-4 w-4" />
              New Lead
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))
          : kpis.map((kpi) => <KPICard key={kpi.title} {...kpi} />)}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Opportunities</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/opportunities">
                  View All
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : recentOpportunities.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">
                  No opportunities yet
                </p>
              ) : (
                <div className="space-y-4">
                  {recentOpportunities.map((opp: any) => (
                    <div
                      key={opp.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                    >
                      <div>
                        <Link
                          href={`/opportunities/${opp.id}`}
                          className="font-medium hover:underline"
                        >
                          {opp.name || "Untitled"}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {opp.stage?.replace(/_/g, " ")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">
                          {opp.amount ? formatAmount(opp.amount) : "—"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {opp.stage}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : pipelineStages.length > 0 ? (
            <PipelineSummary stages={pipelineStages} />
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                No pipeline data
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Recent Activity
              </CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/tasks">View All</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : recentActivities.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center">
                  No recent activity
                </p>
              ) : (
                <div className="space-y-3">
                  {recentActivities.map((activity: any) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 p-2 rounded-lg"
                    >
                      <div
                        className={`mt-0.5 p-1.5 rounded-md text-xs ${getActivityTypeColor(activity.type)}`}
                      >
                        {activity.type?.charAt(0)?.toUpperCase() || "N"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {activity.subject || "Activity"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTimeAgo(activity.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Upcoming Tasks</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/tasks">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : upcomingTasks.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">
                No upcoming tasks
              </p>
            ) : (
              <div className="space-y-3">
                {upcomingTasks.map((task: any) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-2 w-2 rounded-full ${getPriorityColor(task.priority)}`}
                      />
                      <Link
                        href={`/tasks/${task.id}`}
                        className="text-sm hover:underline"
                      >
                        {task.title}
                      </Link>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {task.dueDate ? formatDate(task.dueDate) : "No due date"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-20 flex-col gap-2" asChild>
                <Link href="/leads/new">
                  <Users className="h-5 w-5" />
                  <span>Add Lead</span>
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-2" asChild>
                <Link href="/site-visits">
                  <Calendar className="h-5 w-5" />
                  <span>Schedule Visit</span>
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-2" asChild>
                <Link href="/quotations">
                  <FileText className="h-5 w-5" />
                  <span>Create Quote</span>
                </Link>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-2" asChild>
                <Link href="/opportunities">
                  <TrendingUp className="h-5 w-5" />
                  <span>New Opportunity</span>
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return <LegacyDashboardPage />;
}
