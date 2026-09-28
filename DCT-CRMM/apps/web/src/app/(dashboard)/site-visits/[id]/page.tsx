"use client";

import { formatDate, formatDateTime } from "@/lib/date-format";

import * as React from "react";

import { useParams, useRouter } from "next/navigation";

import Link from "next/link";

import { siteVisitApi } from "@/lib/api";

import { useToast } from "@/hooks/use-toast";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Separator } from "@/components/ui/separator";

import { Skeleton } from "@/components/ui/skeleton";

import {
  ArrowLeft,
  Calendar,
  User,
  MapPin,
  CheckCircle2,
  Clock,
  FileText,
  History,
  StickyNote,
  MessageSquare,
} from "lucide-react";

interface SiteVisitData {
  id: string;
  leadName: string;
  projectName: string;
  visitDate: string;
  status: string;
  assignedTo: string;
  feedback?: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"> = {
  scheduled: "info",
  completed: "success",
  cancelled: "destructive",
  rescheduled: "warning",
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
};

export default function SiteVisitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [siteVisit, setSiteVisit] = React.useState<SiteVisitData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState("details");

  React.useEffect(() => {
    const fetchSiteVisit = async () => {
      try {
        setIsLoading(true);
        const res = await siteVisitApi.get(params.id as string);
        if (res.data.success && res.data.data) {
          setSiteVisit(res.data.data);
        } else {
          toast({ title: "Error", description: "Site visit not found", variant: "destructive" as any });
          router.push("/site-visits");
        }
      } catch {
        toast({ title: "Error", description: "Failed to load site visit", variant: "destructive" as any });
      } finally {
        setIsLoading(false);
      }
    };
    fetchSiteVisit();
  }, [params.id, router, toast]);

  const handleStatusUpdate = async (newStatus: string) => {
    try {
      const res = await siteVisitApi.updateStatus(params.id as string, newStatus);
      if (res.data.success) {
        toast({ title: "Success", description: `Status updated to ${STATUS_LABEL[newStatus] || newStatus}` });
        setSiteVisit((prev) => (prev ? { ...prev, status: newStatus } : prev));
      }
    } catch {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" as any });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!siteVisit) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/site-visits">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Site Visit - {siteVisit.leadName}</h1>
            <p className="text-muted-foreground">Site Visit #{siteVisit.id}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {siteVisit.status === "scheduled" && (
            <>
              <Button onClick={() => handleStatusUpdate("completed")}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Mark Completed
              </Button>
              <Button variant="outline" onClick={() => handleStatusUpdate("rescheduled")}>
                <Clock className="mr-2 h-4 w-4" />
                Reschedule
              </Button>
            </>
          )}
          {siteVisit.status === "rescheduled" && (
            <Button onClick={() => handleStatusUpdate("completed")}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Mark Completed
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={STATUS_VARIANT[siteVisit.status] || "default"}>
                  {STATUS_LABEL[siteVisit.status] || siteVisit.status}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Calendar className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Visit Date</p>
                <p className="text-sm font-medium">
                  {new Date(siteVisit.visitDate).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <User className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Assigned To</p>
                <p className="text-sm font-medium">{siteVisit.assignedTo || "Unassigned"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <MapPin className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Project</p>
                <p className="text-sm font-medium">{siteVisit.projectName || "N/A"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="details" className="gap-2">
            <FileText className="h-4 w-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <History className="h-4 w-4" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-2">
            <StickyNote className="h-4 w-4" />
            Notes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Site Visit Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Lead Name</span>
                  <span className="text-sm font-medium">{siteVisit.leadName}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Project</span>
                  <span className="text-sm font-medium">{siteVisit.projectName || "N/A"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Assigned To</span>
                  <span className="text-sm font-medium">{siteVisit.assignedTo || "Unassigned"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={STATUS_VARIANT[siteVisit.status] || "default"}>
                    {STATUS_LABEL[siteVisit.status] || siteVisit.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Visit Date</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(siteVisit.visitDate)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Created</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(siteVisit.createdAt)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {siteVisit.feedback && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Feedback
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <p className="text-sm whitespace-pre-wrap">{siteVisit.feedback}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No activity recorded</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <StickyNote className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No notes added</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
