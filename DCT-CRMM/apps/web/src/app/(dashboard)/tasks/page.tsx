"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/crm/data-table";
import { FilterBar, FilterField } from "@/components/crm/filters";
import { Plus, MoreHorizontal, Eye, Edit, Trash2, Clock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "pending" | "in-progress" | "completed" | "cancelled";
  assignedTo: string;
  relatedTo?: string;
  relatedType?: "lead" | "opportunity";
  completedAt?: string;
}

const tasks: Task[] = [
  {
    id: "1",
    title: "Follow up with John Smith",
    description: "Call to discuss premium apartment requirements",
    dueDate: "2024-01-20T10:00:00Z",
    priority: "high",
    status: "pending",
    assignedTo: "Rajesh Kumar",
    relatedTo: "John Smith",
    relatedType: "lead",
  },
  {
    id: "2",
    title: "Send quotation to ABC Corp",
    description: "Prepare and send detailed quotation for Commercial Complex",
    dueDate: "2024-01-21T14:00:00Z",
    priority: "medium",
    status: "in-progress",
    assignedTo: "Priya Sharma",
    relatedTo: "ABC Corporation",
    relatedType: "opportunity",
  },
  {
    id: "3",
    title: "Schedule site visit",
    description: "Arrange site visit for Raj Patel at Premium Tower",
    dueDate: "2024-01-22T09:00:00Z",
    priority: "low",
    status: "pending",
    assignedTo: "Amit Verma",
    relatedTo: "Raj Patel",
    relatedType: "lead",
  },
  {
    id: "4",
    title: "Update project inventory",
    description: "Update unit availability for Premium Tower",
    dueDate: "2024-01-19T16:00:00Z",
    priority: "urgent",
    status: "completed",
    assignedTo: "Rajesh Kumar",
    relatedTo: "Premium Tower",
    relatedType: "opportunity",
    completedAt: "2024-01-19T15:30:00Z",
  },
];

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  urgent: "bg-red-100 text-red-800",
};

const statusColors: Record<string, string> = {
  pending: "bg-blue-100 text-blue-800",
  "in-progress": "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-800",
};

const columns: ColumnDef<Task>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
      />
    ),
  },
  {
    accessorKey: "title",
    header: "Task",
    cell: ({ row }) => {
      const task = row.original;
      return (
        <div>
          <Link href={`/tasks/${task.id}`} className="hover:underline font-medium">
            {task.title}
          </Link>
          <p className="text-sm text-muted-foreground line-clamp-1">{task.description}</p>
        </div>
      );
    },
  },
  {
    accessorKey: "dueDate",
    header: "Due Date",
    cell: ({ row }) => {
      const date = new Date(row.getValue("dueDate"));
      const isOverdue = date < new Date();
      return (
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4" />
          <span className={isOverdue ? "text-red-500" : ""}>
            {date.toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "priority",
    header: "Priority",
    cell: ({ row }) => {
      const priority = row.getValue("priority") as string;
      return (
        <Badge className={priorityColors[priority]}>
          {priority}
        </Badge>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <Badge className={statusColors[status]}>
          {status.replace("-", " ")}
        </Badge>
      );
    },
  },
  {
    accessorKey: "assignedTo",
    header: "Assigned To",
  },
  {
    accessorKey: "relatedTo",
    header: "Related To",
    cell: ({ row }) => {
      const task = row.original;
      if (!task.relatedTo) return "-";
      return (
        <Link
          href={`/${task.relatedType}s/${task.id}`}
          className="hover:underline text-primary"
        >
          {task.relatedTo}
        </Link>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const task = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/tasks/${task.id}`}>
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

export default function TasksPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = React.useState(1);
  const [filters, setFilters] = React.useState({ priority: "", status: "" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-muted-foreground">
            Manage your tasks and stay on top of your work
          </p>
        </div>
        <Button onClick={() => toast({ title: "New Task", description: "Create task form coming soon" })}>
          <Plus className="mr-2 h-4 w-4" />
          New Task
        </Button>
      </div>

      <div className="space-y-4">
        <FilterBar
          onReset={() => setFilters({ priority: "", status: "" })}
        >
          <FilterField
            label="Priority"
            type="select"
            value={filters.priority}
            onChange={(value) => setFilters((f) => ({ ...f, priority: value as string }))}
            options={[
              { label: "Low", value: "low" },
              { label: "Medium", value: "medium" },
              { label: "High", value: "high" },
              { label: "Urgent", value: "urgent" },
            ]}
            placeholder="All Priorities"
          />
          <FilterField
            label="Status"
            type="select"
            value={filters.status}
            onChange={(value) => setFilters((f) => ({ ...f, status: value as string }))}
            options={[
              { label: "Pending", value: "pending" },
              { label: "In Progress", value: "in-progress" },
              { label: "Completed", value: "completed" },
              { label: "Cancelled", value: "cancelled" },
            ]}
            placeholder="All Statuses"
          />
        </FilterBar>

        <DataTable
          columns={columns}
          data={tasks}
          searchKey="title"
          searchPlaceholder="Search tasks..."
          totalItems={tasks.length}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />
      </div>
    </div>
  );
}
