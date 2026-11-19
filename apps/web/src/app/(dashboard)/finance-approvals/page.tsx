"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, RefreshCw, X, Check } from "lucide-react";
import { crmDateRangeBounds } from "@dct-crm/shared";
import { receiptApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { CommonFilterPanel, FilterDate, FilterSearch } from "@/components/crm/common-filter-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { matchesApprovalPacketSearch } from "@/lib/mis-approval-search";

type ApprovalStatus = "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "ISSUED";
type ApprovalStage = "MIS" | "FINANCE" | "COMPLETED";

interface FinanceReceipt {
  id: string;
  receiptNumber: string;
  amount: number;
  receivedFrom: string;
  paymentMode: string;
  transactionId?: string | null;
  approvalStatus: ApprovalStatus;
  approvalStage: ApprovalStage;
  kind: "MIS_SUBMISSION" | "CRM_PAYMENT";
  approvalSubmittedAt: string;
  misApprovalStatus?: ApprovalStatus | null;
  misApprovalNote?: string | null;
  misReviewedAt?: string | null;
  misReviewedBy?: { firstName: string; lastName: string } | null;
  financeApprovalStatus?: ApprovalStatus | null;
  financeApprovalNote?: string | null;
  financeReviewedAt?: string | null;
  financeReviewedBy?: { firstName: string; lastName: string } | null;
  lead: {
    id: string;
    leadNumber?: string | null;
    firstName?: string | null;
    lastName: string;
    totalLandAmount?: number | null;
  };
  booking: {
    bookingNumber: string;
    status: string;
    project: { name: string };
    unit: { number: string };
    quotation: { quotationNumber: string; totalPrice: number };
  };
  createdBy: { firstName: string; lastName: string };
}

const currency = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
const dateText = (value?: string | null) => value
  ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value))
  : "—";
const reviewerName = (reviewer?: { firstName: string; lastName: string } | null) =>
  reviewer ? `${reviewer.firstName} ${reviewer.lastName}`.trim() : "—";

function stageText(receipt: FinanceReceipt) {
  if (receipt.approvalStage === "MIS") return "Waiting for MIS";
  if (receipt.approvalStage === "FINANCE") return "Pending Finance";
  return receipt.approvalStatus === "ISSUED" ? "Issued" : receipt.approvalStatus;
}

export default function FinanceApprovalsPage() {
  const { toast } = useToast();
  const [receipts, setReceipts] = React.useState<FinanceReceipt[]>([]);
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [dateError, setDateError] = React.useState("");
  const [reviewingId, setReviewingId] = React.useState<string | null>(null);

  const loadReceipts = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await receiptApi.listFinanceApprovals();
      setReceipts((response.data.data || []) as FinanceReceipt[]);
    } catch (cause) {
      console.error("Failed to load Finance approval receipts:", cause);
      const message = (cause as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(message || "Receipts could not be loaded. Please retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadReceipts();
  }, [loadReceipts]);

  const review = async (receipt: FinanceReceipt, decision: "APPROVE" | "REJECT") => {
    setReviewingId(receipt.id);
    try {
      await receiptApi.reviewFinanceApproval(receipt.id, {
        decision,
        note: notes[receipt.id]?.trim() || undefined,
      });
      toast({
        title: decision === "APPROVE" ? "Receipt approved" : "Receipt rejected",
        description: decision === "APPROVE"
          ? `${currency(receipt.amount)} was deducted from the Lead's Total Land Amount. Booking Amount was not changed.`
          : "The receipt was rejected; no amount was deducted.",
      });
      await loadReceipts();
    } catch (cause) {
      console.error(`Failed to ${decision.toLowerCase()} Finance receipt:`, cause);
      const message = (cause as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast({
        title: decision === "APPROVE" ? "Could not approve receipt" : "Could not reject receipt",
        description: message || "Please refresh and try again.",
        variant: "destructive",
      });
    } finally {
      setReviewingId(null);
    }
  };

  const pendingCount = receipts.filter((receipt) =>
    receipt.approvalStage === "FINANCE" && receipt.approvalStatus === "PENDING_APPROVAL",
  ).length;
  const filteredReceipts = React.useMemo(() => {
    const range = crmDateRangeBounds(dateFrom || undefined, dateTo || undefined);
    const bounds = "error" in range ? null : range;
    return receipts.filter((receipt) => {
      if (!matchesApprovalPacketSearch(receipt, searchQuery)) return false;
      if (!bounds?.gte && !bounds?.lt) return true;
      const submitted = new Date(receipt.approvalSubmittedAt).getTime();
      if (Number.isNaN(submitted)) return false;
      if (bounds.gte && submitted < bounds.gte.getTime()) return false;
      if (bounds.lt && submitted >= bounds.lt.getTime()) return false;
      return true;
    });
  }, [receipts, searchQuery, dateFrom, dateTo]);

  const changeSubmittedDate = (field: "from" | "to", value: string) => {
    const nextFrom = field === "from" ? value : dateFrom;
    const nextTo = field === "to" ? value : dateTo;
    if (nextFrom && nextTo && nextFrom > nextTo) {
      setDateError("To Date cannot be earlier than From Date.");
      return;
    }
    setDateError("");
    if (field === "from") setDateFrom(value);
    else setDateTo(value);
  };

  const resetFilters = () => {
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
    setDateError("");
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Finance Team</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Receipt Approvals</h1>
          <p className="mt-1 text-sm text-slate-600">Review every receipt submitted for a lead. Approved amounts reduce Total Land Amount once; Booking Amount is unchanged.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{pendingCount} pending</Badge>
          <Button type="button" variant="outline" onClick={() => void loadReceipts()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      <CommonFilterPanel className="crm-filter-panel-inline" onReset={resetFilters}>
        <FilterSearch
          id="finance-approval-search"
          label="Search receipts"
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search receipt ID or number..."
        />
        <FilterDate
          id="finance-approval-from"
          label="From Date"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(value) => changeSubmittedDate("from", value)}
        />
        <FilterDate
          id="finance-approval-to"
          label="To Date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(value) => changeSubmittedDate("to", value)}
        />
      </CommonFilterPanel>
      {dateError && <p role="alert" className="text-sm text-rose-700">{dateError}</p>}

      {error && (
        <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <p role="alert" className="text-sm text-rose-700">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadReceipts()}>Retry</Button>
        </CardContent></Card>
      )}

      {loading ? (
        <Card><CardContent className="flex items-center justify-center gap-2 py-14 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading receipts…</CardContent></Card>
      ) : receipts.length === 0 ? (
        <Card><CardContent className="py-14 text-center text-sm text-slate-500">No receipts have been submitted.</CardContent></Card>
      ) : filteredReceipts.length === 0 ? (
        <Card><CardContent className="py-14 text-center text-sm text-slate-500">No receipts match these filters.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filteredReceipts.map((receipt) => {
            const canReview = receipt.approvalStage === "FINANCE" && receipt.approvalStatus === "PENDING_APPROVAL";
            return (
              <Card key={receipt.id}>
                <CardContent className="space-y-4 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-[14rem] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-slate-900">{receipt.receiptNumber}</h2>
                        <Badge variant={receipt.approvalStatus === "REJECTED" ? "destructive" : canReview ? "warning" : "secondary"}>
                          {stageText(receipt)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-700">
                        {receipt.receivedFrom} · {receipt.booking.project.name} · Unit {receipt.booking.unit.number}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {receipt.booking.bookingNumber} · {receipt.lead.leadNumber || receipt.lead.id}
                        {" · "}Submitted {dateText(receipt.approvalSubmittedAt)} by {reviewerName(receipt.createdBy)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-slate-900">{currency(receipt.amount)}</p>
                      <p className="text-xs text-slate-500">
                        Total Land Amount: {receipt.lead.totalLandAmount == null
                          ? `Not set · will initialize from quotation (${currency(receipt.booking.quotation.totalPrice)})`
                          : currency(receipt.lead.totalLandAmount)}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 rounded-md bg-slate-50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <p><span className="text-slate-500">Receipt type:</span> {receipt.kind === "MIS_SUBMISSION" ? "First receipt" : "Customer payment"}</p>
                    <p><span className="text-slate-500">Payment:</span> {receipt.paymentMode}</p>
                    <p><span className="text-slate-500">Transaction ID:</span> {receipt.transactionId || "—"}</p>
                    <p><span className="text-slate-500">Quotation:</span> {receipt.booking.quotation.quotationNumber} · {currency(receipt.booking.quotation.totalPrice)}</p>
                  </div>

                  <div className="grid gap-3 text-xs text-slate-600 sm:grid-cols-2">
                    <p>
                      MIS: {receipt.misApprovalStatus || (receipt.approvalStage === "MIS" ? "Pending" : "Not required")}
                      {receipt.misReviewedAt ? ` · ${reviewerName(receipt.misReviewedBy)} · ${dateText(receipt.misReviewedAt)}` : ""}
                      {receipt.misApprovalNote ? ` · ${receipt.misApprovalNote}` : ""}
                    </p>
                    <p>
                      Finance: {receipt.financeApprovalStatus || (receipt.approvalStage === "FINANCE" ? "Pending" : "Not started")}
                      {receipt.financeReviewedAt ? ` · ${reviewerName(receipt.financeReviewedBy)} · ${dateText(receipt.financeReviewedAt)}` : ""}
                      {receipt.financeApprovalNote ? ` · ${receipt.financeApprovalNote}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                    <Button asChild type="button" variant="outline" size="sm">
                      <Link href={`/leads/${receipt.lead.id}`}>View Lead</Link>
                    </Button>
                    {canReview ? (
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
                        <Textarea
                          aria-label={`Finance note for ${receipt.receiptNumber}`}
                          value={notes[receipt.id] || ""}
                          maxLength={1000}
                          rows={2}
                          placeholder="Finance note (optional)"
                          onChange={(event) => setNotes((current) => ({ ...current, [receipt.id]: event.target.value }))}
                          className="sm:w-72"
                        />
                        <Button type="button" variant="outline" disabled={reviewingId !== null} onClick={() => void review(receipt, "REJECT")} className="text-rose-700">
                          {reviewingId === receipt.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
                          Reject
                        </Button>
                        <Button type="button" disabled={reviewingId !== null} onClick={() => void review(receipt, "APPROVE")} className="bg-emerald-700 text-white hover:bg-emerald-800">
                          {reviewingId === receipt.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                          Approve
                        </Button>
                      </div>
                    ) : receipt.approvalStage === "MIS" ? (
                      <p className="text-xs text-amber-700">This first receipt is awaiting MIS approval.</p>
                    ) : (
                      <p className="text-xs text-slate-500">Final status: {receipt.approvalStatus}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
