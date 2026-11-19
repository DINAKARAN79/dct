import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@dct-crm/db';
import { AuthRequest } from '../middleware/auth';
import { createEnquiryInTransaction, createEnquiryInTransactionWithStatus } from '../services/enquiryService';
import {
  acquireLeadDuplicateLocks,
  findLeadDuplicates,
  normalizeLeadEmail,
  normalizeLeadPhone,
  oldestLeadDuplicate,
  oldestPhoneDuplicate,
  validateLeadContactInput,
} from '../services/leadDuplicateDetection';
import { mergeOperationalLeadCustomFields, tagLeadEnquiryAttribution } from '../services/leadEventTagging';
import { assignLeadToProjectRoundRobinInTransaction } from '../services/rrQueue';
import {
  getCPPortalDashboardLeadCount,
  getCPPortalLeadClassification,
  getCPPortalLeadMatchInput,
} from './cpPortalLeadClassification';
import { toCPPortalSubmissionLead } from './cpPortalLeadSubmission';
import {
  getCPPortalExistingSubmissionReportFilter,
  getCPPortalReportFilter,
} from './cpPortalReports';

const router = Router();
const COOKIE_NAME = 'cp_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 24 * 60 * 60 * 1000,
};

type CPRequest = AuthRequest & { cp?: { id: string; tenantId: string; email: string; username: string; name: string } };

async function requireCP(req: CPRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ success: false, error: 'CP authentication required' });
  }

  let decoded: { accountId: string; tenantId: string; portal: string };
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET!) as typeof decoded;
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired CP session' });
  }
  if (decoded.portal !== 'cp') {
    return res.status(401).json({ success: false, error: 'Invalid CP session' });
  }

  try {
    const account = await prisma.cPPortalAccount.findFirst({
      where: { id: decoded.accountId, tenantId: decoded.tenantId, isActive: true },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        tenantId: true,
        tenant: { select: { isActive: true, companyStartDate: true, companyExpiryDate: true } },
      },
    });
    if (!account) {
      return res.status(401).json({ success: false, error: 'Invalid CP session' });
    }
    const now = new Date();
    if (
      !account.tenant.isActive ||
      (account.tenant.companyStartDate && now < account.tenant.companyStartDate) ||
      (account.tenant.companyExpiryDate && now > account.tenant.companyExpiryDate)
    ) {
      return res.status(403).json({ success: false, error: 'CP account is unavailable' });
    }

    req.cp = {
      id: account.id,
      tenantId: account.tenantId,
      email: account.email,
      username: account.username,
      name: account.name,
    };
    req.tenantId = account.tenantId;
    next();
  } catch (error) {
    next(error);
  }
}

const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254).optional(),
  email: z.string().trim().email().max(254).optional(),
  password: z.string().min(1).max(128),
}).refine((input) => Boolean(input.identifier || input.email), 'Enter a username or email');

router.post('/login', async (req: Request, res: Response) => {
  try {
    const input = loginSchema.parse(req.body);
    const identifier = input.identifier || input.email!;
    const { password } = input;
    if (!process.env.JWT_SECRET) {
      return res.status(503).json({
        success: false,
        error: 'CRM authentication is not configured. Set JWT_SECRET in the local CRM environment.',
      });
    }
    const accounts = await prisma.cPPortalAccount.findMany({
      where: {
        isActive: true,
        OR: [
          { email: { equals: identifier, mode: 'insensitive' } },
          { username: { equals: identifier, mode: 'insensitive' } },
        ],
      },
      include: { tenant: { select: { isActive: true, companyStartDate: true, companyExpiryDate: true } } },
      take: 2,
    });
    const validAccounts = await Promise.all(accounts.map(async (account) =>
      await bcrypt.compare(password, account.passwordHash) ? account : null,
    ));
    const matchingAccounts = validAccounts.filter((account) => account !== null);
    if (matchingAccounts.length !== 1) {
      return res.status(401).json({ success: false, error: 'Invalid username, email, or password' });
    }
    const account = matchingAccounts[0]!;
    const now = new Date();
    if (
      !account.tenant.isActive ||
      (account.tenant.companyStartDate && now < account.tenant.companyStartDate) ||
      (account.tenant.companyExpiryDate && now > account.tenant.companyExpiryDate)
    ) {
      return res.status(403).json({ success: false, error: 'CP account is unavailable' });
    }
    const token = jwt.sign(
      { accountId: account.id, tenantId: account.tenantId, portal: 'cp' },
      process.env.JWT_SECRET!,
      { expiresIn: (process.env.JWT_EXPIRES_IN || '24h') as jwt.SignOptions['expiresIn'] },
    );
    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    res.json({
      success: true,
      data: { id: account.id, email: account.email, username: account.username, name: account.name },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('CP login failed:', error);
    if (typeof error === 'object' && error && 'code' in error && ['P2021', 'P2022'].includes(String(error.code))) {
      return res.status(503).json({
        success: false,
        error: 'CP Portal account storage is not initialized. Ask a CRM administrator to apply the database schema update.',
      });
    }
    if (typeof error === 'object' && error && 'code' in error && String(error.code).startsWith('P10')) {
      return res.status(503).json({
        success: false,
        error: 'Unable to reach the CRM database. Check the CRM database configuration and try again.',
      });
    }
    if (error instanceof Error && error.message.includes('Environment variable not found: DATABASE_URL')) {
      return res.status(503).json({
        success: false,
        error: 'CRM database is not configured. Add DATABASE_URL to the local CRM environment before signing in.',
      });
    }
    if (error instanceof Error && error.message.includes('Authentication failed against database server')) {
      return res.status(503).json({
        success: false,
        error: 'PostgreSQL rejected the credentials in DATABASE_URL. Update the local CRM .env with the correct database password.',
      });
    }
    res.status(500).json({ success: false, error: 'Unable to sign in' });
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTIONS, maxAge: undefined });
  res.json({ success: true });
});

router.get('/me', requireCP, async (req: CPRequest, res: Response) => {
  res.json({
    success: true,
    data: {
      id: req.cp!.id,
      username: req.cp!.username,
      email: req.cp!.email,
      name: req.cp!.name,
    },
  });
});

const leadInputSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().max(254).email().optional().or(z.literal('')),
  secondaryEmail: z.string().trim().max(254).email().optional().or(z.literal('')),
  tertiaryEmail: z.string().trim().max(254).email().optional().or(z.literal('')),
  originalSubmissionId: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().min(3).max(40).regex(/^[0-9+().\s-]+$/),
  secondaryPhone: z.string().trim().max(40).regex(/^[0-9+().\s-]+$/).optional().or(z.literal('')),
  tertiaryPhone: z.string().trim().max(40).regex(/^[0-9+().\s-]+$/).optional().or(z.literal('')),
  country: z.string().trim().min(1).max(100).default('India'),
  countryCode: z.string().trim().regex(/^\+?\d{1,3}$/).default('91'),
  secondaryCountryCode: z.string().trim().regex(/^\+?\d{1,3}$/).default('91'),
  projectId: z.string().min(1),
  leadStatus: z.enum([
    'NEW',
    'INCOMING',
    'PROSPECT',
    'SITE_VISIT_SCHEDULED',
    'SITE_VISIT_HAPPENED',
    'LOST',
  ]).optional(),
  leadSource: z.enum([
    'WEBSITE',
    'REFERRAL',
    'COLD_CALL',
    'ADVERTISEMENT',
    'WALK_IN',
    'PORTAL',
    'FACEBOOK',
    'CHANNEL_PARTNER',
    'INSTAGRAM',
    'TWITTER',
    'WHATSAPP',
    'YOUTUBE',
    'OTHER',
  ]).default('CHANNEL_PARTNER'),
  budget: z.string().trim().min(1).transform(Number).pipe(z.number().finite().min(0)),
  sqftRange: z.string().max(100).optional(),
  bhkSize: z.string().max(50).optional(),
  propertyType: z.string().max(100).optional(),
  stage: z.enum(['cold', 'warm', 'hot', 'lost']).default('cold'),
  remarks: z.string().max(4000).optional(),
});

function statusFilter(stage: string | undefined) {
  if (!stage || stage === 'all') return {};
  if (stage === 'lost') return { status: 'LOST' as const };
  const rating = stage.toUpperCase();
  if (rating === 'HOT' || rating === 'WARM' || rating === 'COLD') {
    return { rating: rating as 'HOT' | 'WARM' | 'COLD' };
  }
  return {};
}

function leadWhere(req: CPRequest, filters: { from?: string; to?: string; projectId?: string }) {
  const createdAt: { gte?: Date; lte?: Date } = {};
  if (filters.from) createdAt.gte = new Date(`${filters.from}T00:00:00.000Z`);
  if (filters.to) createdAt.lte = new Date(`${filters.to}T23:59:59.999Z`);
  return {
    tenantId: req.cp!.tenantId,
    cpPortalAccountId: req.cp!.id,
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
  };
}

router.get('/leads', requireCP, async (req: CPRequest, res: Response) => {
  try {
    const search = String(req.query.search || '').trim();
    const stage = String(req.query.stage || 'all').toLowerCase();
    const report = String(req.query.report || '');
    const projectId = String(req.query.projectId || '');
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    const reportFilter = report ? getCPPortalReportFilter(report) : {};
    if (report && reportFilter === undefined) {
      return res.status(400).json({ success: false, error: 'Unknown CP lead report' });
    }
    if (report && reportFilter === null) {
      return res.json({ success: true, data: [] });
    }
    const existingSubmissionReportFilter = getCPPortalExistingSubmissionReportFilter(report);
    const baseWhere = leadWhere(req, { projectId, from, to });
    const searchTerms = search.split(/\s+/).filter(Boolean);
    const submissionFilters: Prisma.EnquiryWhereInput[] = [
      { details: { path: ['cpPortalAccountId'], equals: req.cp!.id } },
    ];
    if (stage !== 'all') {
      submissionFilters.push({ details: { path: ['stage'], equals: stage } });
    }
    if (existingSubmissionReportFilter && Object.keys(existingSubmissionReportFilter).length) {
      submissionFilters.push(existingSubmissionReportFilter);
    }
    for (const term of searchTerms) {
      submissionFilters.push({
        OR: [
          { details: { path: ['fullName'], string_contains: term } },
          { email: { contains: term, mode: 'insensitive' } },
          { secondaryEmail: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term } },
          { secondaryPhone: { contains: term } },
          { project: { name: { contains: term, mode: 'insensitive' } } },
        ],
      });
    }
    const where = {
      ...baseWhere,
      ...reportFilter,
      ...statusFilter(stage),
      ...(searchTerms.length ? {
        AND: searchTerms.map((term) => ({
          OR: [
            { firstName: { contains: term, mode: 'insensitive' as const } },
            { lastName: { contains: term, mode: 'insensitive' as const } },
            { email: { contains: term, mode: 'insensitive' as const } },
            { secondaryEmail: { contains: term, mode: 'insensitive' as const } },
            { project: { name: { contains: term, mode: 'insensitive' as const } } },
          ],
        })),
      } : {}),
    };
    const includeExistingSubmissions = existingSubmissionReportFilter !== null;
    const [leads, submissions] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          project: { select: { id: true, name: true } },
          siteVisits: { select: { id: true, status: true, completedAt: true }, orderBy: { scheduledAt: 'desc' }, take: 1 },
          enquiries: {
            where: {
              source: 'CHANNEL_PARTNER',
              subSource: 'CP Portal',
              details: { path: ['cpPortalAccountId'], equals: req.cp!.id },
            },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { leadType: true },
          },
          activities: {
            where: { type: 'NOTE' },
            select: { id: true, subject: true, description: true, createdAt: true, user: { select: { firstName: true, lastName: true } } },
            orderBy: { createdAt: 'desc' },
            take: 3,
          },
          cpPortalNotes: { select: { id: true, category: true, text: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 3 },
        },
      }),
      includeExistingSubmissions
        ? prisma.enquiry.findMany({
            where: {
              tenantId: req.cp!.tenantId,
              source: 'CHANNEL_PARTNER',
              subSource: 'CP Portal',
              leadType: 'ADDITIONAL',
              ...(projectId ? { projectId } : {}),
              ...(baseWhere.createdAt ? { createdAt: baseWhere.createdAt } : {}),
              AND: submissionFilters,
            },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              enquiryNumber: true,
              leadType: true,
              phone: true,
              secondaryPhone: true,
              tertiaryPhone: true,
              email: true,
              secondaryEmail: true,
              projectId: true,
              project: { select: { id: true, name: true } },
              details: true,
              createdAt: true,
              description: true,
            },
          })
        : Promise.resolve([]),
    ]);
    res.json({
      success: true,
      data: [
        ...leads.map(({ enquiries, ...lead }) => {
          const leadType = enquiries[0]?.leadType
            ?? (lead.cpPortalAccountId === req.cp!.id ? 'ORIGINAL' : 'ADDITIONAL');
          const classification = getCPPortalLeadClassification(leadType);
          return {
            ...lead,
            cpPortalType: classification.type,
            cpPortalStatus: classification.status,
          };
        }),
        ...submissions.map((enquiry) => toCPPortalSubmissionLead({
          ...enquiry,
          budgetDetails: enquiry.details,
        })),
      ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    });
  } catch (error) {
    console.error('CP leads retrieval failed:', error);
    res.status(500).json({ success: false, error: 'Unable to load leads' });
  }
});

router.post('/leads', requireCP, async (req: CPRequest, res: Response) => {
  try {
    const input = leadInputSchema.parse(req.body);
    const primaryCountryCode = input.countryCode.startsWith('+') ? input.countryCode : `+${input.countryCode}`;
    const secondaryCountryCode = input.secondaryCountryCode.startsWith('+') ? input.secondaryCountryCode : `+${input.secondaryCountryCode}`;
    const tertiaryCountryCode = '+91';
    const originalSubmissionId = input.originalSubmissionId || req.get('Idempotency-Key') || undefined;
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, tenantId: req.cp!.tenantId, isActive: true },
      select: { id: true },
    });
    if (!project) return res.status(400).json({ success: false, error: 'Select a valid project' });

    const leadCreator = await prisma.user.findFirst({
      where: { tenantId: req.cp!.tenantId, isActive: true, profile: { isAdmin: true } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!leadCreator) {
      return res.status(503).json({ success: false, error: 'No active CRM administrator is available to record this lead' });
    }

    const phone = normalizeLeadPhone(input.phone, input.countryCode)?.e164;
    const secondaryPhone = input.secondaryPhone
      ? normalizeLeadPhone(input.secondaryPhone, input.secondaryCountryCode)?.e164
      : null;
    const tertiaryPhone = input.tertiaryPhone
      ? normalizeLeadPhone(input.tertiaryPhone, '91')?.e164
      : null;
    const contactInput = {
      phones: [
        { field: 'phone', value: input.phone, countryCode: primaryCountryCode },
        { field: 'secondaryPhone', value: input.secondaryPhone, countryCode: secondaryCountryCode },
        { field: 'tertiaryPhone', value: input.tertiaryPhone, countryCode: tertiaryCountryCode },
      ],
      emails: [
        { field: 'email', value: input.email },
        { field: 'secondaryEmail', value: input.secondaryEmail },
        { field: 'tertiaryEmail', value: input.tertiaryEmail },
      ],
    };
    const duplicateContactInput = getCPPortalLeadMatchInput(contactInput);
    const validationErrors = validateLeadContactInput(contactInput);
    if (validationErrors.length || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Please enter valid contact details',
        fieldErrors: validationErrors.length ? validationErrors : [{ field: 'phone', message: 'Enter a valid phone number.' }],
      });
    }

    const nameParts = input.fullName.trim().split(/\s+/);
    const outcome = await prisma.$transaction(async (tx) => {
      if (originalSubmissionId) {
        const key = `CP_PORTAL:${originalSubmissionId}`;
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`LEAD_SUBMISSION:${req.cp!.tenantId}:${key}`}, 0))
        `;
        const priorEnquiry = await tx.enquiry.findFirst({
          where: { tenantId: req.cp!.tenantId, originalSubmissionId: key },
          select: { id: true, leadId: true, leadType: true },
        });
        if (priorEnquiry) return { action: 'DUPLICATE_LINKED' as const, leadType: priorEnquiry.leadType };
      }
      await acquireLeadDuplicateLocks(tx, req.cp!.tenantId, duplicateContactInput);
      const duplicates = await findLeadDuplicates(tx, req.cp!.tenantId, duplicateContactInput);
      const canonicalMatch = duplicates.length
        ? oldestLeadDuplicate(oldestPhoneDuplicate(duplicates))[0]
        : undefined;
      if (duplicates.length > 1 || duplicates.some((match) => match.ambiguous)) {
        await tx.auditLog.create({
          data: {
            tenantId: req.cp!.tenantId,
            userId: leadCreator.id,
            action: 'DUPLICATE_MATCH_AMBIGUOUS',
            objectType: 'LeadDuplicate',
            newValues: {
              leadIds: duplicates.map((match) => match.lead.id),
              matchingFields: duplicates.map((match) => ({ leadId: match.lead.id, fields: match.matchedFields })),
              source: 'CHANNEL_PARTNER',
              projectId: project.id,
              action: 'REVIEW_REQUIRED',
            },
          },
        });
      }
      if (canonicalMatch) {
        const existing = canonicalMatch;
        const enquiryResult = await createEnquiryInTransactionWithStatus(tx, {
          tenantId: req.cp!.tenantId,
          leadId: existing.lead.id,
          leadType: 'ADDITIONAL',
          enquiryType: 'ADDITIONAL',
          source: input.leadSource,
          subSource: 'CP Portal',
          projectId: project.id,
          phone: input.phone,
          secondaryPhone: input.secondaryPhone,
          tertiaryPhone: input.tertiaryPhone,
          countryCode: primaryCountryCode,
          secondaryCountryCode,
          tertiaryCountryCode,
          email: normalizeLeadEmail(input.email),
          secondaryEmail: normalizeLeadEmail(input.secondaryEmail),
          tertiaryEmail: normalizeLeadEmail(input.tertiaryEmail),
          originalSubmissionId: originalSubmissionId ? `CP_PORTAL:${originalSubmissionId}` : undefined,
          description: input.remarks,
          channelPartner: req.cp!.name,
          details: {
            cpPortalAccountId: req.cp!.id,
            fullName: input.fullName.trim(),
            budget: input.budget,
            sqftRange: input.sqftRange || null,
            bhkSize: input.bhkSize || null,
            propertyType: input.propertyType || null,
            stage: input.stage,
          },
          userId: leadCreator.id,
        });
        if (enquiryResult.created) {
          const currentLead = await tx.lead.findUniqueOrThrow({
            where: { id: existing.lead.id },
            select: {
              phone: true,
              mobile: true,
              secondaryPhone: true,
              tertiaryPhone: true,
              countryCode: true,
              secondaryCountryCode: true,
              tertiaryCountryCode: true,
            },
          });
          const phoneSlots = [
            { field: 'phone', value: currentLead.phone, countryCode: currentLead.countryCode },
            { field: 'mobile', value: currentLead.mobile, countryCode: currentLead.countryCode },
            { field: 'secondaryPhone', value: currentLead.secondaryPhone, countryCode: currentLead.secondaryCountryCode },
            { field: 'tertiaryPhone', value: currentLead.tertiaryPhone, countryCode: currentLead.tertiaryCountryCode },
          ];
          const incomingPhones = [
            { value: input.phone, countryCode: primaryCountryCode },
            { value: input.secondaryPhone, countryCode: secondaryCountryCode },
            { value: input.tertiaryPhone, countryCode: tertiaryCountryCode },
          ];
          const contactOldValues: Record<string, null> = {};
          const contactNewValues: Record<string, string> = {};
          const leadContactUpdates: {
            phone?: string;
            mobile?: string;
            secondaryPhone?: string;
            tertiaryPhone?: string;
            countryCode?: string;
            secondaryCountryCode?: string;
            tertiaryCountryCode?: string;
          } = {};
          for (const incoming of incomingPhones) {
            const normalized = normalizeLeadPhone(incoming.value, incoming.countryCode);
            if (!normalized) continue;
            const alreadyStored = phoneSlots.some((slot) =>
              normalizeLeadPhone(slot.value, slot.countryCode)?.e164 === normalized.e164,
            );
            if (alreadyStored) continue;
            const slot = phoneSlots.find((candidate) => !candidate.value);
            if (!slot) continue;
            contactOldValues[slot.field] = null;
            contactNewValues[slot.field] = normalized.e164;
            if (slot.field === 'phone') {
              leadContactUpdates.phone = normalized.e164;
              leadContactUpdates.countryCode = incoming.countryCode;
            } else if (slot.field === 'mobile') {
              leadContactUpdates.mobile = normalized.e164;
              const secondarySlot = phoneSlots.find((candidate) => candidate.field === 'secondaryPhone');
              if (!secondarySlot?.value) {
                leadContactUpdates.secondaryPhone = normalized.e164;
                leadContactUpdates.secondaryCountryCode = incoming.countryCode;
                if (secondarySlot) {
                  secondarySlot.value = normalized.e164;
                  secondarySlot.countryCode = incoming.countryCode;
                }
              }
            } else if (slot.field === 'secondaryPhone') {
              leadContactUpdates.secondaryPhone = normalized.e164;
              leadContactUpdates.secondaryCountryCode = incoming.countryCode;
              const mobileSlot = phoneSlots.find((candidate) => candidate.field === 'mobile');
              if (!mobileSlot?.value) {
                leadContactUpdates.mobile = normalized.e164;
                if (mobileSlot) {
                  mobileSlot.value = normalized.e164;
                  mobileSlot.countryCode = incoming.countryCode;
                }
              }
            } else {
              leadContactUpdates.tertiaryPhone = normalized.e164;
              leadContactUpdates.tertiaryCountryCode = incoming.countryCode;
            }
            slot.value = normalized.e164;
            slot.countryCode = incoming.countryCode;
          }
          if (Object.keys(leadContactUpdates).length) {
            await tx.lead.update({
              where: { id: existing.lead.id },
              data: leadContactUpdates,
            });
            await tx.auditLog.create({
              data: {
                tenantId: req.cp!.tenantId,
                userId: leadCreator.id,
                leadId: existing.lead.id,
                action: 'LEAD_CONTACT_DETAILS_SYNCHRONIZED',
                objectType: 'Lead',
                objectId: existing.lead.id,
                oldValues: contactOldValues,
                newValues: contactNewValues,
              },
            });
          }
          await tx.lead.update({
            where: { id: existing.lead.id },
            data: {
              lastSource: input.leadSource,
              lastSubSource: 'CP Portal',
              lastEnquiryAt: new Date(),
              enquiryCount: { increment: 1 },
            },
          });
        }
        const enquiry = enquiryResult.enquiry;
        await tx.cPPortalNote.create({
          data: {
            tenantId: req.cp!.tenantId,
            leadId: existing.lead.id,
            cpPortalAccountId: req.cp!.id,
            category: 'Additional Enquiry',
            text: input.remarks?.trim() || `Additional enquiry submitted for project ${project.id}`,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: req.cp!.tenantId,
            userId: leadCreator.id,
            leadId: existing.lead.id,
            action: 'DUPLICATE_ENQUIRY_LINKED',
            objectType: 'Enquiry',
            objectId: enquiry.id,
            newValues: {
              leadId: existing.lead.id,
              enquiryId: enquiry.id,
              matchingFields: existing.matchedFields,
              source: 'CHANNEL_PARTNER',
              projectId: project.id,
              action: 'RELATED_SOURCE_LINKED',
            },
          },
        });
        return { action: 'DUPLICATE_LINKED' as const, leadType: 'ADDITIONAL' as const };
      }

      const sequence = await tx.sequence.upsert({
        where: { tenantId_type: { tenantId: req.cp!.tenantId, type: 'LEAD' } },
        update: { nextValue: { increment: 1 } },
        create: { tenantId: req.cp!.tenantId, type: 'LEAD', nextValue: 1 },
      });
      const created = await tx.lead.create({
        data: {
          tenantId: req.cp!.tenantId,
          creatorId: leadCreator.id,
          cpPortalAccountId: req.cp!.id,
          leadNumber: `LN${String(sequence.nextValue).padStart(6, '0')}`,
          firstName: nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : undefined,
          lastName: nameParts[nameParts.length - 1],
          company: req.cp!.name || 'Channel Partner',
          source: input.leadSource,
          lastSource: input.leadSource,
          lastSubSource: 'CP Portal',
          lastEnquiryAt: new Date(),
          enquiryCount: 1,
          secondarySource: 'CP Portal',
          tertiarySource: req.cp!.name,
          status: input.leadStatus || (input.stage === 'lost' ? 'LOST' : 'NEW'),
          rating: input.stage === 'lost' || input.leadStatus === 'LOST'
            ? undefined
            : input.stage.toUpperCase() as 'COLD' | 'WARM' | 'HOT',
          phone,
          countryCode: primaryCountryCode,
          tertiaryPhone: tertiaryPhone || undefined,
          tertiaryCountryCode: tertiaryPhone ? tertiaryCountryCode : undefined,
          email: normalizeLeadEmail(input.email) || undefined,
          secondaryEmail: normalizeLeadEmail(input.secondaryEmail) || undefined,
          tertiaryEmail: normalizeLeadEmail(input.tertiaryEmail) || undefined,
          secondaryPhone: secondaryPhone || undefined,
          secondaryCountryCode: secondaryPhone ? secondaryCountryCode : undefined,
          projectId: project.id,
          budget: input.budget,
          sqftRange: input.sqftRange || undefined,
          bhkSize: input.bhkSize || undefined,
          propertyType: input.propertyType || undefined,
          description: input.remarks || undefined,
          customFields: mergeOperationalLeadCustomFields({}, {
            source: input.leadSource,
            status: input.leadStatus || (input.stage === 'lost' ? 'LOST' : 'NEW'),
            rating: input.stage === 'lost' || input.leadStatus === 'LOST'
              ? null
              : input.stage.toUpperCase(),
            description: input.remarks || null,
            score: 0,
          }),
        },
      });
      await tagLeadEnquiryAttribution(tx, {
        tenantId: req.cp!.tenantId,
        leadId: created.id,
        source: input.leadSource,
        subSource: 'CP Portal',
        projectId: project.id,
        countryCode: primaryCountryCode,
        country: input.country,
        secondaryPhone: secondaryPhone || undefined,
        secondaryCountryCode: secondaryPhone ? secondaryCountryCode : undefined,
        tertiaryPhone: tertiaryPhone || undefined,
        occurredAt: new Date(),
        lifecycleType: 'Fresh',
        isLeadCreation: true,
      });
      await createEnquiryInTransaction(tx, {
        tenantId: req.cp!.tenantId,
        leadId: created.id,
        leadType: 'ORIGINAL',
        enquiryType: 'ORIGINAL',
        source: input.leadSource,
        subSource: 'CP Portal',
        projectId: project.id,
        phone: input.phone,
        secondaryPhone: input.secondaryPhone,
        tertiaryPhone: input.tertiaryPhone,
        countryCode: primaryCountryCode,
        secondaryCountryCode: secondaryPhone ? secondaryCountryCode : undefined,
        tertiaryCountryCode: tertiaryPhone ? tertiaryCountryCode : undefined,
        email: normalizeLeadEmail(input.email),
        secondaryEmail: normalizeLeadEmail(input.secondaryEmail),
        tertiaryEmail: normalizeLeadEmail(input.tertiaryEmail),
        originalSubmissionId: originalSubmissionId ? `CP_PORTAL:${originalSubmissionId}` : undefined,
        description: input.remarks,
        channelPartner: req.cp!.name,
        details: {
          cpPortalAccountId: req.cp!.id,
          fullName: input.fullName.trim(),
          budget: input.budget,
          sqftRange: input.sqftRange || null,
          bhkSize: input.bhkSize || null,
          propertyType: input.propertyType || null,
          leadStatus: input.leadStatus || (input.stage === 'lost' ? 'LOST' : 'NEW'),
          leadRating: input.stage || 'cold',
        },
        userId: leadCreator.id,
      });
      const noteText = input.remarks?.trim() || 'Enquiry created successfully';
      await tx.cPPortalNote.create({
        data: {
          tenantId: req.cp!.tenantId,
          leadId: created.id,
          cpPortalAccountId: req.cp!.id,
          category: 'Initial Remarks',
          text: noteText,
        },
      });
      let assignment: { assignedUserId: string; queueId: string; memberId: string } | null = null;
      let assignmentWarning: string | undefined;
      try {
        assignment = await assignLeadToProjectRoundRobinInTransaction(tx, {
          tenantId: req.cp!.tenantId,
          leadId: created.id,
          projectId: created.projectId,
          userType: 'Pre Sales',
          actorId: leadCreator.id,
          reason: 'New channel partner lead assigned to project/source-matched Pre Sales round robin',
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : '';
        if (
          reason !== 'RR_QUEUE_NOT_ACTIVE' &&
          !reason.startsWith('RR_QUEUE_NOT_CONFIGURED:') &&
          !reason.startsWith('NO_ELIGIBLE_RR_MEMBER:')
        ) {
          throw error;
        }
        assignmentWarning = 'Lead saved, but no eligible Pre Sales round-robin member was found for this project and lead source.';
        await tx.auditLog.create({
          data: {
            tenantId: req.cp!.tenantId,
            userId: leadCreator.id,
            leadId: created.id,
            action: 'RR_LEAD_ASSIGNMENT_SKIPPED',
            objectType: 'Lead',
            objectId: created.id,
            newValues: {
              projectId: created.projectId,
              source: created.source,
              userType: 'Pre Sales',
              reason,
            },
          },
        });
      }
      return { action: 'NEW_LEAD' as const, lead: created, assignment, assignmentWarning };
    });
    if (outcome.action === 'DUPLICATE_LINKED') {
      const classification = getCPPortalLeadClassification(outcome.leadType);
      const message = 'Enquiry linked to the existing CRM record.';
      return res.status(200).json({
        success: true,
        duplicate: true,
        linked: true,
        data: {
          message,
          cpPortalType: classification.type,
          cpPortalStatus: classification.status,
        },
        message,
      });
    }
    const classification = getCPPortalLeadClassification('ORIGINAL');
    const message = outcome.assignmentWarning || 'Lead registered and assigned to the appropriate Pre Sales round robin.';
    res.status(201).json({
      success: true,
      data: {
        ...outcome.lead,
        message,
        cpPortalType: classification.type,
        cpPortalStatus: classification.status,
      },
      assignment: outcome.assignment,
      assignmentWarning: outcome.assignmentWarning,
      message,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    if (typeof error === 'object' && error && 'code' in error && (error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ success: false, duplicate: true, message: 'Lead Exists on the System Already' });
    }
    console.error('CP lead creation failed:', error);
    res.status(500).json({ success: false, error: 'Unable to register lead' });
  }
});

router.get('/dashboard', requireCP, async (req: CPRequest, res: Response) => {
  try {
    const projectId = String(req.query.projectId || '');
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    const scopedLeadWhere = leadWhere(req, { projectId, from, to });
    const submissionWhere: Prisma.EnquiryWhereInput = {
      tenantId: req.cp!.tenantId,
      source: 'CHANNEL_PARTNER',
      subSource: 'CP Portal',
      details: { path: ['cpPortalAccountId'], equals: req.cp!.id },
      ...(projectId ? { projectId } : {}),
      ...(scopedLeadWhere.createdAt ? { createdAt: scopedLeadWhere.createdAt } : {}),
    };
    const existingSubmissionWhere: Prisma.EnquiryWhereInput = {
      ...submissionWhere,
      leadType: 'ADDITIONAL',
    };
    const lostSubmissionReportFilter = getCPPortalExistingSubmissionReportFilter('lost-leads');
    const qualifiedSubmissionReportFilter = getCPPortalExistingSubmissionReportFilter('qualified-leads');
    const [leads, existingSubmissionCount, lostSubmissionCount, qualifiedSubmissionCount] = await Promise.all([
      prisma.lead.findMany({
        where: scopedLeadWhere,
        select: {
          id: true,
          status: true,
          rating: true,
          isRegistered: true,
          siteVisits: { where: { status: 'COMPLETED' }, select: { id: true }, take: 1 },
          bookings: { where: { status: 'CANCELLED' }, select: { id: true }, take: 1 },
        },
      }),
      prisma.enquiry.count({ where: existingSubmissionWhere }),
      prisma.enquiry.count({
        where: {
          ...existingSubmissionWhere,
          AND: [lostSubmissionReportFilter],
        },
      }),
      prisma.enquiry.count({
        where: {
          ...existingSubmissionWhere,
          AND: [qualifiedSubmissionReportFilter],
        },
      }),
    ]);
    const stats = {
      totalLeads: getCPPortalDashboardLeadCount(leads.length, existingSubmissionCount),
      lostLeads: leads.filter((lead) => lead.status === 'LOST').length + lostSubmissionCount,
      siteVisits: leads.filter((lead) => lead.siteVisits.length > 0).length,
      qualifiedLeads: leads.filter((lead) => lead.rating === 'HOT' || lead.rating === 'WARM').length
        + qualifiedSubmissionCount,
      bookedLeads: leads.filter((lead) => lead.status === 'BOOKED').length,
      registeredLeads: leads.filter((lead) => lead.isRegistered).length,
      cancelledAfterBooking: leads.filter((lead) => lead.bookings.length > 0).length,
    };
    const recentLeads = await prisma.lead.findMany({
      where: leadWhere(req, { projectId, from, to }),
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { id: true, leadNumber: true, firstName: true, lastName: true, status: true, createdAt: true, project: { select: { name: true } } },
    });
    res.json({ success: true, data: { stats, recentLeads } });
  } catch (error) {
    console.error('CP dashboard retrieval failed:', error);
    res.status(500).json({ success: false, error: 'Unable to load dashboard' });
  }
});

router.get('/projects', requireCP, async (req: CPRequest, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      where: { tenantId: req.cp!.tenantId, isActive: true },
      orderBy: { updatedAt: 'desc' },
      include: {
        units: { select: { status: true } },
        _count: { select: { units: true } },
      },
    });
    res.json({
      success: true,
      data: projects.map(({ units, _count, ...project }) => ({
        ...project,
        availableUnits: units.filter((unit) => unit.status === 'AVAILABLE').length,
        totalUnits: project.totalUnits ?? _count.units,
      })),
    });
  } catch (error) {
    console.error('CP projects retrieval failed:', error);
    res.status(500).json({ success: false, error: 'Unable to load projects' });
  }
});

router.get('/projects/:id/brochure', requireCP, async (req: CPRequest, res: Response) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, tenantId: req.cp!.tenantId, isActive: true },
      select: { brochureUrl: true },
    });
    if (!project?.brochureUrl) return res.status(404).json({ success: false, error: 'Brochure not found' });
    res.json({ success: true, data: { url: project.brochureUrl } });
  } catch (error) {
    console.error('CP brochure retrieval failed:', error);
    res.status(500).json({ success: false, error: 'Unable to retrieve brochure' });
  }
});

router.get('/leads/:id/notes', requireCP, async (req: CPRequest, res: Response) => {
  try {
    const leadWhereClause = { id: req.params.id, tenantId: req.cp!.tenantId, cpPortalAccountId: req.cp!.id };
    const lead = await prisma.lead.findFirst({ where: leadWhereClause, select: { id: true } });
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    const [cpNotes, crmNotes] = await Promise.all([
      prisma.cPPortalNote.findMany({
        where: { tenantId: req.cp!.tenantId, leadId: lead.id },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.activity.findMany({
        where: { tenantId: req.cp!.tenantId, leadId: lead.id, type: 'NOTE' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, subject: true, description: true, createdAt: true, user: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    res.json({ success: true, data: { cpNotes, crmNotes } });
  } catch (error) {
    console.error('CP notes retrieval failed:', error);
    res.status(500).json({ success: false, error: 'Unable to load lead notes' });
  }
});

router.post('/leads/:id/notes', requireCP, async (req: CPRequest, res: Response) => {
  try {
    const input = z.object({
      category: z.string().trim().min(1).max(80),
      text: z.string().trim().min(1).max(4000),
    }).parse(req.body);
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, tenantId: req.cp!.tenantId, cpPortalAccountId: req.cp!.id },
      select: { id: true },
    });
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    const note = await prisma.cPPortalNote.create({
      data: {
        tenantId: req.cp!.tenantId,
        leadId: lead.id,
        cpPortalAccountId: req.cp!.id,
        ...input,
      },
    });
    res.status(201).json({ success: true, data: note });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: error.errors[0].message });
    console.error('CP note creation failed:', error);
    res.status(500).json({ success: false, error: 'Unable to add note' });
  }
});

router.post('/reset-password', requireCP, async (req: CPRequest, res: Response) => {
  try {
    const input = z.object({
      email: z.string().trim().email(),
      newPassword: z.string().min(8).max(128),
    }).parse(req.body);
    if (input.email.toLowerCase() !== req.cp!.email.toLowerCase()) {
      return res.status(403).json({ success: false, error: 'You can only reset the password for your CP account' });
    }
    await prisma.cPPortalAccount.update({
      where: { id: req.cp!.id },
      data: { passwordHash: await bcrypt.hash(input.newPassword, 12) },
    });
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: error.errors[0].message });
    console.error('CP password reset failed:', error);
    res.status(500).json({ success: false, error: 'Unable to reset password' });
  }
});

export default router;
