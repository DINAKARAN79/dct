"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface ChangeOwnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fieldId: string;
  children: React.ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  isBusy?: boolean;
  isDisabled?: boolean;
  confirmLabel?: string;
  busyLabel?: string;
}

export function ChangeOwnerDialog({
  open,
  onOpenChange,
  title,
  fieldId,
  children,
  onCancel,
  onConfirm,
  isBusy = false,
  isDisabled = false,
  confirmLabel = "Change Owner",
  busyLabel = "Changing...",
}: ChangeOwnerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="bg-black/50" className="crm-sky w-[calc(100vw-2rem)] max-w-[470px] gap-0 overflow-visible border-slate-200 bg-white p-0 [&_label]:font-semibold [&_label]:text-slate-700">
        <DialogHeader className="border-b border-slate-200 px-6 py-4">
          <DialogTitle className="text-center text-lg font-semibold text-[#17365d]">
            {title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Select a new owner and confirm the ownership change.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-6 py-4">
          <div className="flex justify-end text-[11px] text-slate-600">
            <span><span className="text-destructive">*</span> = Required Information</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId} className="text-xs">
              Select New Owner{" "}
              <span className="text-destructive">*</span>
            </Label>
            {children}
          </div>
        </div>
        <DialogFooter className="border-t border-slate-200 px-6 py-3">
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-full border-[#d84843] px-4 text-xs text-[#c83b37] hover:bg-red-50"
            onClick={onCancel}
            disabled={isBusy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-8 rounded-full bg-[#d84843] px-4 text-xs text-white hover:bg-[#c83b37]"
            onClick={onConfirm}
            disabled={isBusy || isDisabled}
          >
            {isBusy ? busyLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
