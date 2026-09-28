"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/crm/data-table";
import { FilterBar, FilterField } from "@/components/crm/filters";
import { Plus, MoreHorizontal, Eye, Edit, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface SiteVisit {
  id: string;
  leadName: string;
  projectName: string;
  visitDate: string;
  status: "scheduled" | "completed" | "cancelled" | "rescheduled";
  assignedTo: string;
  feedback?: string;
}

const siteVisits: SiteVisit[] = [
  {
    id: "1",
    leadName: "John Smith",
    projectName: "Premium Tower",
    visitDate: "2024-01-20T10:00:00Z",
    status: "scheduled",
    assignedTo: "Rajesh Kumar",
  },
  {
    id: "2",
    leadName: "Sarah Johnson",
    projectName: "Commercial Complex",
    visitDate: "2024-01-19T14:00:00Z",
    status: "completed",
    assignedTo: "Priya Sharma",
    feedback: "Client liked the project, will follow up next week",
  },
  {
    id: "3",
    leadName: "Raj Patel",
    projectName: "Residential Project",
    visitDate: "2024-01-18T11:00:00Z",
    status: "cancelled",
    assignedTo: "Amit Verma",
  },
  {
    id: "4",
    leadName: "Priya Gupta",
    projectName: "Premium Tower",
    visitDate: "2024-01-21T09:00:00Z",
    status: "rescheduled",
    assignedTo: "Rajesh Kumar",
  },
];

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  rescheduled: "bg-yellow-100 text-yellow-800",
};

const columns: ColumnDef<SiteVisit>[] = [
  {
    accessorKey: "leadName",
    header: "Lead",
    cell: ({ row }) => (
      <Link href={`/leads/${row.original.id}`} className="hover:underline font-medium">
        {row.getValue("leadName")}
      </Link>
    ),
  },
  {
    accessorKey: "projectName",
    header: "Project",
  },
  {
    accessorKey: "visitDate",
    header: "Visit Date",
    cell: ({ row }) => {
      const date = new Date(row.getValue("visitDate"));
      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <Badge className={statusColors[status]}>
          {status}
        </Badge>
      );
    },
  },
  {
    accessorKey: "assignedTo",
    header: "Assigned To",
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const visit = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/site-visits/${visit.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

export default function SiteVisitsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = React.useState(1);
  const [filters, setFilters] = React.useState({ status: "" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Site Visits</h1>
          <p className="text-muted-foreground">
            Schedule and track project site visits
          </p>
        </div>
        <Button onClick={() => toast({ title: "Schedule Visit", description: "Schedule visit form coming soon" })}>
          <Plus className="mr-2 h-4 w-4" />
          Schedule Visit
        </Button>
      </div>

      <div className="space-y-4">
        <FilterBar onReset={() => setFilters({ status: "" })}>
          <FilterField
            label="Status"
            type="select"
            value={filters.status}
            onChange={(value) => setFilters({ status: value as string })}
            options={[
              { label: "Scheduled", value: "scheduled" },
              { label: "Completed", value: "completed" },
              { label: "Cancelled", value: "cancelled" },
              { label: "Rescheduled", value: "rescheduled" },
            ]}
            placeholder="All Statuses"
          />
        </FilterBar>

        <DataTable
          columns={columns}
          data={siteVisits}
          searchKey="leadName"
          searchPlaceholder="Search by lead name..."
          totalItems={siteVisits.length}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />
      </div>
    </div>
  );
}
