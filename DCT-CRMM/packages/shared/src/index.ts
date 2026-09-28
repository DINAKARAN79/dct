import { z } from 'zod';

export const PHONE_DUPLICATE_ERROR = 'Phone number already exists for another lead.';

export function normalizePhone(raw: string): string {
  return raw.replace(/\s+/g, '');
}

// ============================================
// AUTH SCHEMAS
// ============================================

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  tenantSlug: z.string().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(8),
  confirmPassword: z.string().min(8),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// ============================================
// CRM SCHEMAS
// ============================================

export const leadSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().min(1, 'Last name is required'),
  salutation: z.enum(['MR', 'MS', 'MRS', 'DR', 'PROF']).optional(),
  title: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string({
    required_error: 'Phone number is required.',
    invalid_type_error: 'Phone number is required.',
  }).trim().min(1, 'Phone number is required.').transform(normalizePhone),
  mobile: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  company: z.string().min(1, 'Company is required'),
  industry: z.enum(['TECHNOLOGY', 'HEALTHCARE', 'FINANCE', 'EDUCATION', 'MANUFACTURING', 'RETAIL', 'REAL_ESTATE', 'CONSTRUCTION', 'HOSPITALITY', 'AUTOMOTIVE', 'ENERGY', 'TELECOMMUNICATIONS', 'MEDIA', 'GOVERNMENT', 'OTHER']).optional(),
  annualRevenue: z.number().optional(),
  numberOfEmployees: z.number().optional(),
  source: z.enum(['WEBSITE', 'REFERRAL', 'COLD_CALL', 'ADVERTISEMENT', 'WALK_IN', 'PORTAL', 'INSTAGRAM', 'TWITTER', 'WHATSAPP', 'YOUTUBE', 'OTHER']).default('OTHER'),
  status: z.enum(['NEW', 'INCOMING', 'PROSPECT', 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_HAPPENED', 'BOOKED', 'LOST']).optional(),
  rating: z.enum(['HOT', 'WARM', 'COLD']).optional(),
  description: z.string().optional(),
  street: z.string().optional(),
  city: z.string().optional(),
  stateProvince: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  score: z.number().optional(),
  budget: z.number().optional(),
  requirements: z.string().optional(),
  notes: z.string().optional(),
  ownerId: z.string().optional(),
  projectId: z.string().optional(),
});

export const siteVisitSchema = z.object({
  leadId: z.string().min(1),
  projectId: z.string().min(1, 'Project is required'),
  assigneeId: z.string().optional(),
  scheduledAt: z.string().datetime(),
  notes: z.string().min(1, 'Note/reason is required'),
});

export const opportunitySchema = z.object({
  name: z.string().min(1),
  stage: z.enum(['PROSPECTING', 'QUALIFICATION', 'NEEDS_ANALYSIS', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST']).default('PROSPECTING'),
  amount: z.number().optional(),
  expectedCloseDate: z.string().optional(),
  probability: z.number().min(0).max(100).optional(),
  description: z.string().optional(),
  leadId: z.string().optional(),
  ownerId: z.string().optional(),
  projectId: z.string().optional(),
});

export const quotationSchema = z.object({
  opportunityId: z.string().optional(),
  leadId: z.string().optional(),
  projectId: z.string().optional(),
  totalAmount: z.number().min(0),
  taxAmount: z.number().optional(),
  discount: z.number().optional(),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    unitId: z.string().optional(),
    description: z.string().min(1),
    quantity: z.number().min(1).default(1),
    unitPrice: z.number().min(0),
    totalPrice: z.number().min(0),
  })),
});

export const bookingSchema = z.object({
  leadId: z.string().optional(),
  opportunityId: z.string().optional(),
  quotationId: z.string().optional(),
  projectId: z.string().min(1),
  unitId: z.string().min(1),
  ownerId: z.string().optional(),
  totalAmount: z.number().min(0),
  notes: z.string().optional(),
});

export const paymentSchema = z.object({
  bookingId: z.string().min(1),
  amount: z.number().min(0.01),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export const projectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  totalUnits: z.number().optional(),
});

export const unitSchema = z.object({
  projectId: z.string().min(1),
  number: z.string().min(1),
  type: z.string().optional(),
  floor: z.number().optional(),
  area: z.number().optional(),
  price: z.number().optional(),
  status: z.enum(['AVAILABLE', 'HOLD', 'RESERVED', 'BOOKED', 'SOLD', 'BLOCKED']).default('AVAILABLE'),
});

export const taskSchema = z.object({
  title: z.string().min(1, 'Title/Description is required'),
  description: z.string().min(1, 'Description is required'),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).default('PENDING'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  dueDate: z.string().min(1, 'Due date is required'),
  leadId: z.string().optional(),
  siteVisitId: z.string().optional(),
  opportunityId: z.string().optional(),
});

export const followUpSchema = z.object({
  title: z.string().min(1, 'Title/Note is required'),
  description: z.string().min(1, 'Description/Note is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  leadId: z.string().optional(),
});

export const activitySchema = z.object({
  type: z.enum(['CALL', 'MEETING', 'WHATSAPP', 'EMAIL', 'SITE_VISIT', 'NOTE', 'TASK', 'FOLLOW_UP', 'SYSTEM']),
  subject: z.string().min(1, 'Subject is required'),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  leadId: z.string().optional(),
  siteVisitId: z.string().optional(),
  opportunityId: z.string().optional(),
  bookingId: z.string().optional(),
});

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================
// AI TYPES
// ============================================

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: any[];
  toolResults?: any[];
  createdAt: Date;
}

export interface AIConversation {
  id: string;
  title?: string;
  messages: AIChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AIToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

export interface AIToolResult {
  tool: string;
  result: any;
  success: boolean;
  error?: string;
}

// ============================================
// ANALYTICS TYPES
// ============================================

export interface MetricDefinition {
  name: string;
  description: string;
  source: string;
  dateField: string;
  calculation: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
  filters?: Record<string, any>;
}

export interface DashboardWidget {
  id: string;
  type: 'kpi' | 'metric' | 'chart' | 'table' | 'funnel' | 'leaderboard' | 'trend' | 'gauge';
  title: string;
  metric?: string;
  data?: any;
  config?: Record<string, any>;
  position: { x: number; y: number; w: number; h: number };
}

// ============================================
// SEARCH TYPES
// ============================================

export interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  url: string;
  tenantId: string;
}

export interface SearchFilters {
  types?: string[];
  dateRange?: { start: string; end: string };
  status?: string[];
  owner?: string;
}
