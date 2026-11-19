CREATE TYPE "ReceiptApprovalStage" AS ENUM ('MIS', 'FINANCE', 'COMPLETED');

ALTER TABLE "Lead"
  ADD COLUMN "totalLandAmount" DOUBLE PRECISION;

ALTER TABLE "Receipt"
  ADD COLUMN "approvalStage" "ReceiptApprovalStage" NOT NULL DEFAULT 'MIS',
  ADD COLUMN "misApprovalStatus" "ReceiptApprovalStatus",
  ADD COLUMN "misReviewedById" TEXT,
  ADD COLUMN "misReviewedAt" TIMESTAMP(3),
  ADD COLUMN "misApprovalNote" TEXT,
  ADD COLUMN "financeApprovalStatus" "ReceiptApprovalStatus",
  ADD COLUMN "financeReviewedById" TEXT,
  ADD COLUMN "financeReviewedAt" TIMESTAMP(3),
  ADD COLUMN "financeApprovalNote" TEXT;

UPDATE "Receipt"
SET
  "approvalStage" = 'COMPLETED',
  "misApprovalStatus" = CASE WHEN "kind" = 'MIS_SUBMISSION' THEN "approvalStatus" ELSE NULL END,
  "misReviewedById" = CASE WHEN "kind" = 'MIS_SUBMISSION' THEN "reviewedById" ELSE NULL END,
  "misReviewedAt" = CASE WHEN "kind" = 'MIS_SUBMISSION' THEN "approvalReviewedAt" ELSE NULL END,
  "misApprovalNote" = CASE WHEN "kind" = 'MIS_SUBMISSION' THEN "approvalNote" ELSE NULL END
WHERE "approvalStatus" <> 'PENDING_APPROVAL';

UPDATE "Receipt"
SET
  "approvalStage" = 'FINANCE',
  "financeApprovalStatus" = 'PENDING_APPROVAL'
WHERE "kind" = 'CRM_PAYMENT'
  AND "approvalStatus" = 'PENDING_APPROVAL';

UPDATE "Receipt"
SET "misApprovalStatus" = 'PENDING_APPROVAL'
WHERE "kind" = 'MIS_SUBMISSION'
  AND "approvalStatus" = 'PENDING_APPROVAL';

ALTER TABLE "Receipt"
  ADD CONSTRAINT "Receipt_misReviewedById_fkey"
  FOREIGN KEY ("misReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Receipt_financeReviewedById_fkey"
  FOREIGN KEY ("financeReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Receipt_tenantId_approvalStage_approvalSubmittedAt_idx"
  ON "Receipt"("tenantId", "approvalStage", "approvalSubmittedAt");
