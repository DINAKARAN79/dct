"use client";

import { formatDate, formatDateTime } from "@/lib/date-format";

import * as React from "react";

import { useParams, useRouter } from "next/navigation";

import { useAuth } from "@/contexts/auth-context";

import { leadApi, siteVisitApi, opportunityApi, activityApi, taskApi, followUpApi, objectManagerApi, projectApi } from "@/lib/api";

import LayoutDrivenForm from "@/components/admin/layout-driven-form";

import { useToast } from "@/hooks/use-toast";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Separator } from "@/components/ui/separator";

import { Skeleton } from "@/components/ui/skeleton";

import { Textarea } from "@/components/ui/textarea";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  FileText,
  CheckSquare,
  Clock,
  Map,
  TrendingUp,
  History,
  ArrowLeft,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  StickyNote,
  Edit3,
  Save,
  X,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  INCOMING: "Incoming",
  PROSPECT: "Prospect",
  SITE_VISIT_SCHEDULED: "Site Visit Scheduled",
  SITE_VISIT_HAPPENED: "Site Visit Happened",
  BOOKED: "Booked",
  LOST: "Lost",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"> = {
  NEW: "info",
  INCOMING: "info",
  PROSPECT: "warning",
  SITE_VISIT_SCHEDULED: "warning",
  SITE_VISIT_HAPPENED: "success",
  BOOKED: "success",
  LOST: "destructive",
};

const RECOVERY_REASONS = [
  "Not Interested",
  "Budget Issue",
  "No Response",
  "Property Not Suitable",
  "Customer Request",
  "Other",
];

const LEAD_STATUS_PROGRESSION = [
  { key: "NEW", label: "New" },
  { key: "INCOMING", label: "Incoming" },
  { key: "PROSPECT", label: "Prospect" },
  { key: "SITE_VISIT_SCHEDULED", label: "Site Visit Scheduled" },
  { key: "SITE_VISIT_HAPPENED", label: "Site Visit Happened" },
  { key: "BOOKED", label: "Booked" },
  { key: "LOST", label: "Lost" },
];

interface LeadData {
  id: string;
  leadNumber: string;
  salutation?: string;
  firstName?: string;
  lastName: string;
  title?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  website?: string;
  company: string;
  industry?: string;
  annualRevenue?: number;
  numberOfEmployees?: number;
  source: string;
  status: string;
  rating?: string;
  description?: string;
  score?: number;
  budget?: number;
  street?: string;
  city?: string;
  stateProvince?: string;
  country?: string;
  postalCode?: string;
  requirements?: string;
  notes?: string;
  owner?: { id: string; firstName: string; lastName: string };
  creator?: { id: string; firstName: string; lastName: string };
  project?: { id: string; name: string };
  siteVisits?: any[];
  opportunities?: any[];
  activities?: any[];
  tasks?: any[];
  followUps?: any[];
  auditLogs?: any[];
  ownerHistory?: any[];
  lastModified?: {
    by?: { id: string; firstName: string; lastName: string; email?: string | null } | null;
    at?: string;
    action?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { profile, user, isLoading: authLoading, hasPermission, hasEffectivePermission } = useAuth();
  const { toast } = useToast();
  const leadId = params.id as string;

  const [lead, setLead] = React.useState<LeadData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isActionLoading, setIsActionLoading] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("overview");
  const [recoveryDialogOpen, setRecoveryDialogOpen] = React.useState(false);
  const [recoveryReason, setRecoveryReason] = React.useState("");
  const [recoveryNote, setRecoveryNote] = React.useState("");
  const [layout, setLayout] = React.useState<any>(null);
  const [fields, setFields] = React.useState<any[]>([]);

  const [statusNote, setStatusNote] = React.useState("");
  const [statusDialogOpen, setStatusDialogOpen] = React.useState(false);
  const [pendingStatus, setPendingStatus] = React.useState("");

  const [followUpDialogOpen, setFollowUpDialogOpen] = React.useState(false);
  const [followUpNote, setFollowUpNote] = React.useState("");
  const [followUpDate, setFollowUpDate] = React.useState("");
  const [followUpTime, setFollowUpTime] = React.useState("");

  const [taskDialogOpen, setTaskDialogOpen] = React.useState(false);
  const [taskNote, setTaskNote] = React.useState("");
  const [taskDueDate, setTaskDueDate] = React.useState("");
  const [taskTime, setTaskTime] = React.useState("");

  const [siteVisitDialogOpen, setSiteVisitDialogOpen] = React.useState(false);
  const [svProjectId, setSvProjectId] = React.useState("");
  const [svNote, setSvNote] = React.useState("");
  const [svDate, setSvDate] = React.useState("");
  const [svTime, setSvTime] = React.useState("");
  const [projects, setProjects] = React.useState<any[]>([]);

  const [noteDialogOpen, setNoteDialogOpen] = React.useState(false);
  const [noteContent, setNoteContent] = React.useState("");
  const [noteSubject, setNoteSubject] = React.useState("");

  const [pushSvcDialogOpen, setPushSvcDialogOpen] = React.useState(false);
  const [pushSvcReason, setPushSvcReason] = React.useState("");

  const [auditLogs, setAuditLogs] = React.useState<any[]>([]);
  const [auditPage, setAuditPage] = React.useState(1);
  const [auditTotalPages, setAuditTotalPages] = React.useState(1);
  const [auditTotal, setAuditTotal] = React.useState(0);
  const [auditLoading, setAuditLoading] = React.useState(false);

  const [isEditing, setIsEditing] = React.useState(false);
  const [editData, setEditData] = React.useState<Record<string, any>>({});
  const [editFieldErrors, setEditFieldErrors] = React.useState<Record<string, string>>({});
  const [editReason, setEditReason] = React.useState("");

  const fetchLead = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const [leadRes, layoutRes, fieldsRes] = await Promise.all([
        leadApi.get(leadId),
        objectManagerApi.getDefaultLayout("Lead"),
        objectManagerApi.listFields("Lead", { includeSystem: true }),
      ]);
      if (leadRes.data.success && leadRes.data.data) {
        setLead(leadRes.data.data);
      }
      setLayout(layoutRes.data.data);
      setFields(fieldsRes.data.data || []);
    } catch {
      toast({ title: "Error", description: "Failed to load lead", variant: "destructive" as any });
    } finally {
      setIsLoading(false);
    }
  }, [leadId, toast]);

  const fetchAuditHistory = React.useCallback(
    async (page = 1) => {
      setAuditLoading(true);
      try {
        const res = await leadApi.getAuditHistory(leadId, { page, limit: 20 });
        if (res.data.success) {
          setAuditLogs(res.data.data || []);
          const p = res.data.pagination;
          setAuditPage(p?.page || page);
          setAuditTotalPages(p?.totalPages || 1);
          setAuditTotal(p?.total || 0);
        }
      } catch {
        toast({
          title: "Error",
          description: "Failed to load audit history",
          variant: "destructive" as any,
        });
      } finally {
        setAuditLoading(false);
      }
    },
    [leadId, toast],
  );

  React.useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  React.useEffect(() => {
    if (activeTab === "audit-history" && auditLogs.length === 0 && !auditLoading) {
      fetchAuditHistory(1);
    }
  }, [activeTab, auditLogs.length, auditLoading, fetchAuditHistory]);

  React.useEffect(() => {
    if (siteVisitDialogOpen) {
      projectApi.list({ limit: 100 }).then((res) => {
        setProjects(res.data.data || []);
      });
    }
  }, [siteVisitDialogOpen]);

  const profileName = profile?.name?.toLowerCase() || "";
  const isAdminOrManager = profileName.includes("admin") || profileName.includes("manager");
  const isPresales = profileName.includes("presales");
  const isSVC = profileName.includes("svc") || profileName.includes("site visit");
  const isSales = profileName.includes("sales");
  const isCRM = profileName.includes("crm");
  const isFinance = profileName.includes("finance");
  const isRecovery = profileName.includes("recovery");
  const canEditLead =
    hasPermission("Lead", "edit") ||
    hasEffectivePermission("LEAD_UPDATE") ||
    hasEffectivePermission("FULL_SYSTEM_ACCESS") ||
    isAdminOrManager;

  const status = lead?.status || "";

  const startEdit = () => {
    if (!lead) return;
    const { leadNumber: _ln, owner: _o, creator: _c, project: _p, ...rest } = lead;
    setEditData(rest);
    setEditFieldErrors({});
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditData({});
    setEditFieldErrors({});
    setEditReason("");
  };

  const saveEdit = async () => {
    if (!lead) return;
    setEditFieldErrors({});
    if (!editData.lastName?.trim()) {
      toast({ title: "Validation", description: "Last name is required", variant: "destructive" as any });
      return;
    }
    if (!editData.company?.trim()) {
      toast({ title: "Validation", description: "Company is required", variant: "destructive" as any });
      return;
    }
    if (!String(editData.phone ?? "").trim()) {
      setEditFieldErrors({ phone: "Phone number is required." });
      toast({ title: "Validation", description: "Phone number is required.", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      const payload: Record<string, any> = {};
      for (const [key, value] of Object.entries(editData)) {
        if (value !== null && value !== undefined && value !== "") {
          payload[key] = value;
        }
      }
      delete payload.leadNumber;
      delete payload.id;
      delete payload.leadStatus;
      delete payload.leadSource;
      if (payload.status === lead.status) delete payload.status;
      if (editReason.trim()) payload.reason = editReason.trim();
      await leadApi.update(leadId, payload);
      toast({ title: "Success", description: "Lead updated successfully" });
      setIsEditing(false);
      setEditData({});
      setEditFieldErrors({});
      setEditReason("");
      await fetchLead();
      if (activeTab === "audit-history") {
        fetchAuditHistory(1);
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.error || err?.response?.data?.message || err?.message || "Failed to update lead";
      if (message === "Phone number already exists for another lead.") {
        setEditFieldErrors({ phone: message });
      }
      toast({ title: "Error", description: message, variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleAction = async (action: () => Promise<void>, label: string) => {
    setIsActionLoading(true);
    try {
      await action();
      await fetchLead();
      if (activeTab === "audit-history") {
        fetchAuditHistory(1);
      }
    } catch {
      toast({ title: "Error", description: `${label} failed`, variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleStatusUpdateWithNote = async () => {
    if (!statusNote.trim()) {
      toast({ title: "Validation", description: "A note/reason is required for status change", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      await leadApi.updateStatus(leadId, pendingStatus, statusNote);
      toast({ title: "Success", description: `Status updated to ${STATUS_LABELS[pendingStatus] || pendingStatus}` });
      setStatusDialogOpen(false);
      setStatusNote("");
      setPendingStatus("");
      await fetchLead();
      if (activeTab === "audit-history") {
        fetchAuditHistory(1);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || "Status update failed", variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const openStatusDialog = (newStatus: string) => {
    setPendingStatus(newStatus);
    setStatusNote("");
    setStatusDialogOpen(true);
  };

  const handlePushToSVC = async () => {
    if (!pushSvcReason.trim()) {
      toast({ title: "Validation", description: "A reason/note is required", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      await leadApi.pushToSVC(leadId, { reason: pushSvcReason });
      toast({ title: "Success", description: "Lead pushed to SVC" });
      setPushSvcDialogOpen(false);
      setPushSvcReason("");
      await fetchLead();
      if (activeTab === "audit-history") {
        fetchAuditHistory(1);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || "Push to SVC failed", variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleMoveToRecovery = async () => {
    if (!recoveryReason) {
      toast({ title: "Validation", description: "Please select a reason", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      await leadApi.moveToRecovery(leadId, { recoveryReason, note: recoveryNote || undefined });
      toast({ title: "Success", description: "Lead moved to recovery" });
      setRecoveryDialogOpen(false);
      setRecoveryReason("");
      setRecoveryNote("");
      await fetchLead();
      if (activeTab === "audit-history") {
        fetchAuditHistory(1);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || "Failed to move to recovery", variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleScheduleSiteVisit = async () => {
    if (!svNote.trim()) {
      toast({ title: "Validation", description: "Note/reason is required", variant: "destructive" as any });
      return;
    }
    if (!svDate || !svTime) {
      toast({ title: "Validation", description: "Visit date and time are required", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      const scheduledAt = new Date(`${svDate}T${svTime}`).toISOString();
      await leadApi.scheduleSiteVisit(leadId, { scheduledAt, notes: svNote, projectId: svProjectId || undefined });
      toast({ title: "Success", description: "Site visit scheduled" });
      setSiteVisitDialogOpen(false);
      setSvNote("");
      setSvDate("");
      setSvTime("");
      setSvProjectId("");
      await fetchLead();
      if (activeTab === "audit-history") {
        fetchAuditHistory(1);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || "Failed to schedule site visit", variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCreateFollowUp = async () => {
    if (!followUpNote.trim() || !followUpDate || !followUpTime) {
      toast({ title: "Validation", description: "Note, date, and time are all required", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      const dueDate = new Date(`${followUpDate}T${followUpTime}`).toISOString();
      await followUpApi.create({ title: followUpNote, description: followUpNote, dueDate, leadId });
      toast({ title: "Success", description: "Follow-up created" });
      setFollowUpDialogOpen(false);
      setFollowUpNote("");
      setFollowUpDate("");
      setFollowUpTime("");
      await fetchLead();
      if (activeTab === "audit-history") {
        fetchAuditHistory(1);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || "Failed to create follow-up", variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCreateTask = async () => {
    if (!taskNote.trim() || !taskDueDate || !taskTime) {
      toast({ title: "Validation", description: "Description, due date, and time are all required", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      const dueDate = new Date(`${taskDueDate}T${taskTime}`).toISOString();
      await taskApi.create({ title: taskNote, description: taskNote, dueDate, leadId });
      toast({ title: "Success", description: "Task created" });
      setTaskDialogOpen(false);
      setTaskNote("");
      setTaskDueDate("");
      setTaskTime("");
      await fetchLead();
      if (activeTab === "audit-history") {
        fetchAuditHistory(1);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || "Failed to create task", variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCreateNote = async () => {
    if (!noteContent.trim()) {
      toast({ title: "Validation", description: "Note content is required", variant: "destructive" as any });
      return;
    }
    setIsActionLoading(true);
    try {
      await activityApi.create({ type: "NOTE", subject: noteSubject || "Note", description: noteContent, leadId });
      toast({ title: "Success", description: "Note added" });
      setNoteDialogOpen(false);
      setNoteContent("");
      setNoteSubject("");
      await fetchLead();
      if (activeTab === "audit-history") {
        fetchAuditHistory(1);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.response?.data?.error || "Failed to add note", variant: "destructive" as any });
    } finally {
      setIsActionLoading(false);
    }
  };

  const getWorkflowActions = (): { label: string; onClick: () => void; variant?: "default" | "outline" | "destructive" | "secondary" }[] => {
    const actions: { label: string; onClick: () => void; variant?: "default" | "outline" | "destructive" | "secondary" }[] = [];

    const canAct = (roleCheck: boolean, statuses: string[]) =>
      (isAdminOrManager || roleCheck) && statuses.includes(status);

    if (canAct(isPresales, ["NEW", "INCOMING"])) {
      if (status === "INCOMING") {
        actions.push({ label: "Push to SVC", onClick: () => setPushSvcDialogOpen(true), variant: "default" });
        actions.push({ label: "Move to Recovery", onClick: () => setRecoveryDialogOpen(true), variant: "destructive" });
      }
    }

    if (canAct(isSVC, ["PROSPECT"])) {
      actions.push({ label: "Schedule Site Visit", onClick: () => setSiteVisitDialogOpen(true), variant: "default" });
    }

    if (canAct(isSVC, ["SITE_VISIT_SCHEDULED"])) {
      actions.push({ label: "Mark Visit Completed", onClick: () => openStatusDialog("SITE_VISIT_HAPPENED"), variant: "default" });
    }

    if (canAct(isSales, ["SITE_VISIT_SCHEDULED", "SITE_VISIT_HAPPENED"])) {
      actions.push({ label: "Mark Booked", onClick: () => openStatusDialog("BOOKED"), variant: "default" });
    }

    if (canAct(isRecovery, ["LOST"])) {
      actions.push({ label: "Move to Incoming", onClick: () => openStatusDialog("INCOMING"), variant: "default" });
    }

    return actions;
  };

  const workflowActions = getWorkflowActions();

  const formatAuditValue = (value: any): string => {
    if (value === null || value === undefined || value === "") return "—";
    if (value instanceof Date) return formatDateTime(value);
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  };

  const getAuditChanges = (entry: any): { field: string; oldValue: any; newValue: any }[] => {
    const oldVals = entry.oldValues || {};
    const newVals = entry.newValues || {};
    const fields = new Set([...Object.keys(oldVals), ...Object.keys(newVals)]);
    const changes: { field: string; oldValue: any; newValue: any }[] = [];

    if (entry.action === "CREATE" || entry.action === "FOLLOW_UP_CREATED" || entry.action === "TASK_CREATED" || entry.action === "NOTE_CREATED") {
      for (const field of Object.keys(newVals)) {
        if (field === "reason" || field === "note") continue;
        changes.push({ field, oldValue: null, newValue: newVals[field] });
      }
      return changes;
    }

    for (const field of fields) {
      if (field === "reason" || field === "note") continue;
      const oldV = oldVals[field];
      const newV = newVals[field];
      if (JSON.stringify(oldV ?? null) !== JSON.stringify(newV ?? null)) {
        changes.push({ field, oldValue: oldV, newValue: newV });
      }
    }
    return changes;
  };

  const getAuditReason = (entry: any): string | null => {
    const newVals = entry.newValues || {};
    return newVals.reason || newVals.note || newVals.recoveryReason || null;
  };

  const lastModifiedBy = lead?.lastModified?.by;
  const lastModifiedAt = lead?.lastModified?.at || lead?.updatedAt;

  if (isLoading || authLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-20 w-full" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Lead not found</p>
      </div>
    );
  }

  const leadDisplayName = `${lead.firstName ? lead.firstName + " " : ""}${lead.lastName}`;

  return (
    <div className="space-y-6">
      {/* Lead Status Progression */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Lead Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {LEAD_STATUS_PROGRESSION.map((step, idx) => {
              const isCurrent = step.key === status;
              return (
                <React.Fragment key={step.key}>
                  <div className="flex flex-col items-center min-w-[80px]">
                    <div
                      className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium ${
                        isCurrent
                          ? "bg-blue-600 text-white ring-2 ring-blue-200"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isCurrent ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <span className="text-[10px]">{idx + 1}</span>
                      )}
                    </div>
                    <span
                      className={`text-[10px] mt-1 text-center ${
                        isCurrent ? "font-semibold text-blue-600" : "text-muted-foreground"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {idx < LEAD_STATUS_PROGRESSION.length - 1 && (
                    <div
                      className={`h-0.5 w-4 mt-[-12px] ${
                        isCurrent ? "bg-blue-400" : "bg-muted"
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Lead Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{leadDisplayName}</h1>
            <Badge variant="outline" className="font-mono text-sm">
              {lead.leadNumber}
            </Badge>
            <Badge variant={STATUS_VARIANT[STATUS_LABELS[status] ? status : "default"]}>
              {STATUS_LABELS[status] || status}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">Lead ID: {lead.id}</p>
          {lead.owner && (
            <p className="text-sm mt-1">
              <span className="text-muted-foreground">Owner: </span>
              <span className="font-medium">{lead.owner.firstName} {lead.owner.lastName}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canEditLead && !isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={startEdit}
              disabled={isActionLoading}
            >
              <Edit3 className="h-4 w-4 mr-1" />Edit
            </Button>
          )}
          {isEditing && (
            <>
              <Button
                size="sm"
                onClick={saveEdit}
                disabled={isActionLoading}
              >
                {isActionLoading ? (
                  <>
                    <Clock className="h-4 w-4 mr-1 animate-spin" />Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-1" />Save
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={cancelEdit}
                disabled={isActionLoading}
              >
                <X className="h-4 w-4 mr-1" />Cancel
              </Button>
            </>
          )}
          {!isEditing && workflowActions.map((action) => (
            <Button
              key={action.label}
              variant={action.variant || "default"}
              size="sm"
              onClick={action.onClick}
              disabled={isActionLoading}
            >
              {action.label}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFollowUpDialogOpen(true)}
          >
            <Clock className="h-4 w-4 mr-1" />Follow-up
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTaskDialogOpen(true)}
          >
            <CheckSquare className="h-4 w-4 mr-1" />Task
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setNoteDialogOpen(true)}
          >
            <StickyNote className="h-4 w-4 mr-1" />Note
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <User className="h-4 w-4" />Overview
          </TabsTrigger>
          <TabsTrigger value="owner-history" className="gap-2">
            <History className="h-4 w-4" />Owner History
          </TabsTrigger>
          <TabsTrigger value="activities" className="gap-2">
            <History className="h-4 w-4" />Activities
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-2">
            <CheckSquare className="h-4 w-4" />Tasks
          </TabsTrigger>
          <TabsTrigger value="followups" className="gap-2">
            <Clock className="h-4 w-4" />Follow-ups
          </TabsTrigger>
          <TabsTrigger value="site-visits" className="gap-2">
            <Map className="h-4 w-4" />Site Visits
          </TabsTrigger>
          <TabsTrigger value="opportunities" className="gap-2">
            <TrendingUp className="h-4 w-4" />Opportunities
          </TabsTrigger>
          <TabsTrigger value="audit-history" className="gap-2">
            <FileText className="h-4 w-4" />Audit History
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {isEditing && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Edit Reason (optional)</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Why are you updating this lead? This will be recorded in audit history..."
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                />
              </CardContent>
            </Card>
          )}
          {lead && layout && (
            <LayoutDrivenForm
              objectName="Lead"
              mode={isEditing ? "edit" : "detail"}
              data={isEditing ? editData : lead}
              onChange={
                isEditing
                  ? (field, value) => {
                      setEditData((prev) => ({ ...prev, [field]: value }));
                      if (field === "phone") {
                        setEditFieldErrors((prev) => {
                          if (!prev.phone) return prev;
                          const { phone: _phone, ...rest } = prev;
                          return rest;
                        });
                      }
                    }
                  : undefined
              }
              layout={layout}
              fields={fields}
              fieldErrors={isEditing ? editFieldErrors : undefined}
            />
          )}

          <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Timeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Created</p>
                    <p className="text-xs text-muted-foreground">{formatDate(lead!.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Last Updated</p>
                    <p className="text-xs text-muted-foreground">{formatDate(lead!.updatedAt)}</p>
                  </div>
                </div>
                {lead!.creator && (
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Created By</p>
                      <p className="text-xs text-muted-foreground">{lead!.creator.firstName} {lead!.creator.lastName}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Edit3 className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Last Modified</p>
                    <p className="text-xs text-muted-foreground">{lastModifiedAt ? formatDateTime(lastModifiedAt) : "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      by{" "}
                      {lastModifiedBy
                        ? `${lastModifiedBy.firstName} ${lastModifiedBy.lastName}`
                        : "Unknown"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
        </TabsContent>

        {/* Owner History Tab */}
        <TabsContent value="owner-history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Owner History</CardTitle>
            </CardHeader>
            <CardContent>
              {lead.ownerHistory && lead.ownerHistory.length > 0 ? (
                <div className="space-y-3">
                  {lead.ownerHistory.map((entry: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                      <User className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {entry.previousOwner && (
                            <span className="text-sm font-medium">
                              {entry.previousOwner.firstName} {entry.previousOwner.lastName}
                            </span>
                          )}
                          {entry.previousOwner && entry.newOwner && (
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          )}
                          {entry.newOwner && (
                            <span className="text-sm font-medium">
                              {entry.newOwner.firstName} {entry.newOwner.lastName}
                            </span>
                          )}
                          {!entry.previousOwner && entry.newOwner && (
                            <span className="text-sm text-muted-foreground">Initial Assignment</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          {entry.previousProfile && <span>{entry.previousProfile}</span>}
                          {entry.previousProfile && entry.newProfile && <span>→</span>}
                          {entry.newProfile && <span>{entry.newProfile}</span>}
                        </div>
                        {entry.handoffReason && (
                          <p className="text-xs text-muted-foreground mt-1">{entry.handoffReason}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{formatDateTime(entry.startDate)}</span>
                          {entry.endDate && <span>→ {formatDateTime(entry.endDate)}</span>}
                          {!entry.endDate && <span>→ Current</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No owner history recorded</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activities Tab */}
        <TabsContent value="activities">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {lead.activities && lead.activities.length > 0 ? (
                <div className="space-y-3">
                  {lead.activities.map((activity: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 text-left p-3 rounded-md bg-muted/50">
                      <History className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm">{activity.description || activity.type}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(activity.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No activities recorded yet</p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {lead.tasks && lead.tasks.length > 0 ? (
                <div className="space-y-3">
                  {lead.tasks.map((task: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 text-left p-3 rounded-md bg-muted/50">
                      <CheckSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm">{task.title || task.name}</p>
                        <p className="text-xs text-muted-foreground">{task.status} {task.dueDate ? `- Due ${formatDate(task.dueDate)}` : ""}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <CheckSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No tasks assigned</p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Follow-ups Tab */}
        <TabsContent value="followups">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {lead.followUps && lead.followUps.length > 0 ? (
                <div className="space-y-3">
                  {lead.followUps.map((fu: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 text-left p-3 rounded-md bg-muted/50">
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm">{fu.title || fu.description || fu.type}</p>
                        <p className="text-xs text-muted-foreground">{fu.dueDate ? formatDateTime(fu.dueDate) : fu.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No follow-ups scheduled</p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Site Visits Tab */}
        <TabsContent value="site-visits">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {lead.siteVisits && lead.siteVisits.length > 0 ? (
                <div className="space-y-3">
                  {lead.siteVisits.map((sv: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 text-left p-3 rounded-md bg-muted/50">
                      <Map className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm">{sv.status || "Scheduled"} {sv.project?.name ? `- ${sv.project.name}` : ""}</p>
                        <p className="text-xs text-muted-foreground">{sv.scheduledAt ? formatDateTime(sv.scheduledAt) : sv.createdAt ? formatDateTime(sv.createdAt) : ""}</p>
                        {sv.assignee && <p className="text-xs text-muted-foreground">Assigned: {sv.assignee.firstName} {sv.assignee.lastName}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <Map className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No site visits scheduled</p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Opportunities Tab */}
        <TabsContent value="opportunities">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {lead.opportunities && lead.opportunities.length > 0 ? (
                <div className="space-y-3">
                  {lead.opportunities.map((opp: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 text-left p-3 rounded-md bg-muted/50">
                      <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm">{opp.name || opp.title || "Opportunity"}</p>
                        <p className="text-xs text-muted-foreground">{opp.stage || opp.status} {opp.amount ? `- ₹${opp.amount.toLocaleString()}` : ""}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No opportunities created</p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit History Tab */}
        <TabsContent value="audit-history">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Audit History</CardTitle>
              <p className="text-xs text-muted-foreground">
                {auditTotal} record{auditTotal === 1 ? "" : "s"} · newest first
              </p>
            </CardHeader>
            <CardContent>
              {auditLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : auditLogs.length > 0 ? (
                <div className="space-y-3">
                  {auditLogs.map((entry: any) => {
                    const changes = getAuditChanges(entry);
                    const reason = getAuditReason(entry);
                    const userName = entry.user
                      ? `${entry.user.firstName} ${entry.user.lastName}`
                      : "System";
                    return (
                      <div key={entry.id} className="p-3 rounded-md bg-muted/50 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{entry.action}</Badge>
                            <span className="text-sm font-medium">{userName}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(entry.createdAt)}
                          </span>
                        </div>
                        {changes.length > 0 && (
                          <div className="space-y-1">
                            {changes.map((change, idx) => (
                              <div key={idx} className="text-xs flex flex-wrap items-center gap-1">
                                <span className="font-medium">{change.field}:</span>
                                <span className="text-muted-foreground">
                                  {formatAuditValue(change.oldValue)}
                                </span>
                                <span aria-hidden="true">→</span>
                                <span>{formatAuditValue(change.newValue)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {reason && (
                          <p className="text-xs text-muted-foreground">
                            Reason: {reason}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {auditTotalPages > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchAuditHistory(Math.max(1, auditPage - 1))}
                        disabled={auditPage <= 1 || auditLoading}
                      >
                        Previous
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Page {auditPage} of {auditTotalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchAuditHistory(Math.min(auditTotalPages, auditPage + 1))}
                        disabled={auditPage >= auditTotalPages || auditLoading}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No audit history recorded</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Status Change Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Status to {STATUS_LABELS[pendingStatus] || pendingStatus}</DialogTitle>
            <DialogDescription>A note/reason is required for this status change.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="status-note">Note / Reason *</Label>
              <Textarea
                id="status-note"
                placeholder="Enter the reason for this status change..."
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
            <Button onClick={handleStatusUpdateWithNote} disabled={isActionLoading || !statusNote.trim()}>
              {isActionLoading ? "Updating..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Push to SVC Dialog */}
      <Dialog open={pushSvcDialogOpen} onOpenChange={setPushSvcDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Push Lead to SVC?</DialogTitle>
            <DialogDescription>This lead will be assigned to a Site Visit Coordinator via Round Robin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="push-svc-reason">Reason / Note *</Label>
              <Textarea
                id="push-svc-reason"
                placeholder="Enter reason for pushing to SVC..."
                value={pushSvcReason}
                onChange={(e) => setPushSvcReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPushSvcDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
            <Button onClick={handlePushToSVC} disabled={isActionLoading || !pushSvcReason.trim()}>
              {isActionLoading ? "Pushing..." : "Push to SVC"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Recovery Dialog */}
      <Dialog open={recoveryDialogOpen} onOpenChange={setRecoveryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Lead to Recovery?</DialogTitle>
            <DialogDescription>This lead will be marked as Lost and moved to the Recovery workflow.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleMoveToRecovery(); }}>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="recovery-reason">Reason *</Label>
                <Select value={recoveryReason} onValueChange={setRecoveryReason}>
                  <SelectTrigger id="recovery-reason">
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {RECOVERY_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="recovery-note">Note (optional)</Label>
                <Textarea
                  id="recovery-note"
                  placeholder="Add any additional notes..."
                  value={recoveryNote}
                  onChange={(e) => setRecoveryNote(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRecoveryDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
              <Button variant="destructive" type="submit" disabled={isActionLoading}>
                {isActionLoading ? "Moving..." : "Move to Recovery"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Schedule Site Visit Dialog */}
      <Dialog open={siteVisitDialogOpen} onOpenChange={setSiteVisitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Site Visit</DialogTitle>
            <DialogDescription>All fields are mandatory.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="sv-project">Project *</Label>
              <Select value={svProjectId} onValueChange={setSvProjectId}>
                <SelectTrigger id="sv-project">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sv-note">Note / Reason *</Label>
              <Textarea
                id="sv-note"
                placeholder="Enter reason for site visit..."
                value={svNote}
                onChange={(e) => setSvNote(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sv-date">Visit Date *</Label>
                <Input
                  id="sv-date"
                  type="date"
                  value={svDate}
                  onChange={(e) => setSvDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sv-time">Visit Time *</Label>
                <Input
                  id="sv-time"
                  type="time"
                  value={svTime}
                  onChange={(e) => setSvTime(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSiteVisitDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
            <Button onClick={handleScheduleSiteVisit} disabled={isActionLoading}>
              {isActionLoading ? "Scheduling..." : "Schedule Visit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Follow-up Dialog */}
      <Dialog open={followUpDialogOpen} onOpenChange={setFollowUpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Follow-up</DialogTitle>
            <DialogDescription>All fields are mandatory.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="fu-note">Note / Reason *</Label>
              <Textarea
                id="fu-note"
                placeholder="Enter follow-up note/reason..."
                value={followUpNote}
                onChange={(e) => setFollowUpNote(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fu-date">Date *</Label>
                <Input
                  id="fu-date"
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fu-time">Time *</Label>
                <Input
                  id="fu-time"
                  type="time"
                  value={followUpTime}
                  onChange={(e) => setFollowUpTime(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFollowUpDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
            <Button onClick={handleCreateFollowUp} disabled={isActionLoading}>
              {isActionLoading ? "Creating..." : "Create Follow-up"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Task Dialog */}
      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
            <DialogDescription>All fields are mandatory.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="task-note">Description *</Label>
              <Textarea
                id="task-note"
                placeholder="Enter task description..."
                value={taskNote}
                onChange={(e) => setTaskNote(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="task-date">Due Date *</Label>
                <Input
                  id="task-date"
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-time">Time *</Label>
                <Input
                  id="task-time"
                  type="time"
                  value={taskTime}
                  onChange={(e) => setTaskTime(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
            <Button onClick={handleCreateTask} disabled={isActionLoading}>
              {isActionLoading ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Note Dialog */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
            <DialogDescription>Note content is mandatory.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="note-subject">Subject</Label>
              <Input
                id="note-subject"
                placeholder="Note subject..."
                value={noteSubject}
                onChange={(e) => setNoteSubject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note-content">Note Content *</Label>
              <Textarea
                id="note-content"
                placeholder="Enter note content..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
            <Button onClick={handleCreateNote} disabled={isActionLoading || !noteContent.trim()}>
              {isActionLoading ? "Adding..." : "Add Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
