"use client";

import * as React from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/crm/data-table";
import { format } from "date-fns";
import { MoreHorizontal, Eye, Edit, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface Lead {
  id: string;
  leadNumber: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phone: string;
  source: string;
  status: string;
  rating?: string;
  priority: string;
  assignedTo: string;
  createdAt: string;
  updatedAt: string;
}

interface LeadListProps {
  leads: Lead[];
  isLoading?: boolean;
  totalItems?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
}

const STATUS_LABEL_MAP: Record<string, string> = {
  new: "New",
  incoming: "Incoming",
  prospect: "Prospect",
  site_visit_scheduled: "Site Visit Scheduled",
  site_visit_happened: "Site Visit Happened",
  booked: "Booked",
  lost: "Lost",
};

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  incoming: "bg-cyan-100 text-cyan-800",
  prospect: "bg-yellow-100 text-yellow-800",
  site_visit_scheduled: "bg-orange-100 text-orange-800",
  site_visit_happened: "bg-amber-100 text-amber-800",
  booked: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-800",
};

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  urgent: "bg-red-100 text-red-800",
};

export const leadColumns: ColumnDef<Lead>[] = [
  {
    accessorKey: "leadNumber",
    header: "Lead Number",
    cell: ({ row }) => (
      <span className="font-mono text-sm">{row.getValue("leadNumber")}</span>
    ),
  },
  {
    accessorKey: "firstName",
    header: "Name",
    cell: ({ row }) => {
      const lead = row.original;
      return (
        <Link href={`/leads/${lead.id}`} className="hover:underline font-medium">
          {lead.firstName} {lead.lastName}
        </Link>
      );
    },
  },
  {
    accessorKey: "company",
    header: "Company",
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "phone",
    header: "Phone",
  },
  {
    accessorKey: "source",
    header: "Source",
    cell: ({ row }) => (
      <Badge variant="outline">{row.getValue("source")}</Badge>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      const label = STATUS_LABEL_MAP[status] || status;
      return (
        <Badge className={cn(statusColors[status])}>
          {label}
        </Badge>
      );
    },
  },
  {
    accessorKey: "priority",
    header: "Priority",
    cell: ({ row }) => {
      const priority = row.getValue("priority") as string;
      return (
        <Badge className={cn("capitalize", priorityColors[priority])}>
          {priority}
        </Badge>
      );
    },
  },
  {
    accessorKey: "assignedTo",
    header: "Assigned To",
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => format(new Date(row.getValue("createdAt")), "MMM d, yyyy"),
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const lead = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/leads/${lead.id}`}>
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

export function LeadList({
  leads,
  isLoading,
  totalItems,
  currentPage,
  onPageChange,
}: LeadListProps) {
  return (
    <div className="space-y-4">
      <DataTable
        columns={leadColumns}
        data={leads}
        searchKey="firstName"
        searchPlaceholder="Search by name..."
        isLoading={isLoading}
        totalItems={totalItems}
        currentPage={currentPage}
        onPageChange={onPageChange}
      />
    </div>
  );
}
