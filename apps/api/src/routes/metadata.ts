import { Router } from 'express';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getAllFieldDefinitions } from '../services/metadata';

const router = Router();
router.use(authenticate);

const INTERNAL_FIELD_PATTERNS = [
  'password',
  'token',
  'secret',
  'api_key',
  'apikey',
  'tenant_id',
  'tenantid',
  'deleted',
  'is_deleted',
  'deleted_at',
  'deletedat',
  'soft_delete',
];

function humanizeKey(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function fieldDataType(fieldType?: string | null) {
  if (!fieldType) return 'text';
  const normalized = fieldType.toLowerCase();
  const typeMap: Record<string, string> = {
    text: 'text',
    longtext: 'text',
    richtext: 'text',
    email: 'email',
    phone: 'phone',
    integer: 'number',
    decimal: 'number',
    float: 'number',
    currency: 'currency',
    percentage: 'number',
    boolean: 'boolean',
    date: 'date',
    datetime: 'datetime',
    datetime_local: 'datetime',
    time: 'datetime',
    picklist: 'picklist',
    multipicklist: 'multi_picklist',
    multiselect: 'multi_picklist',
    lookup: 'lookup',
    relationship: 'lookup',
    reference: 'lookup',
    autoNumber: 'number',
  };
  return typeMap[normalized] || 'text';
}

function isSensitiveKey(key: string) {
  const lowered = key.toLowerCase();
  return INTERNAL_FIELD_PATTERNS.some((pattern) => lowered.includes(pattern)) || lowered === 'tenantid' || lowered === 'tenant_id';
}

function toMetadataEntry(field: any) {
  const key = field.name || field.key;
  if (!key || isSensitiveKey(key)) return null;

  const picklistValues = Array.isArray(field.picklistValues)
    ? field.picklistValues
        .filter((value: any) => value && (value.value || value.label))
        .map((value: any) => ({ value: String(value.value ?? value.label), label: String(value.label ?? value.value ?? value) }))
    : undefined;

  const dataType = fieldDataType(field.fieldType || field.dataType);
  return {
    key,
    label: field.label || humanizeKey(key),
    dataType,
    ...(picklistValues && picklistValues.length ? { options: picklistValues } : {}),
    ...(field.lookupObject ? { lookupObject: field.lookupObject } : {}),
    isFilterable: field.filterable !== false && field.isFilterable !== false,
  };
}

router.get('/:objectName/fields', async (req: AuthRequest, res) => {
  try {
    const objectName = String(req.params.objectName || '').trim();
    if (!objectName) {
      return res.status(400).json({ success: false, error: 'Object name is required' });
    }

    const object = await prisma.objectDefinition.findFirst({
      where: { tenantId: req.tenantId!, name: { equals: objectName, mode: 'insensitive' } },
      select: { id: true, name: true },
    });

    if (!object) {
      return res.status(404).json({ success: false, error: 'Object not found' });
    }

    const fields = await getAllFieldDefinitions(req.tenantId!, object.id, object.name);
    const metadata = fields
      .map((field) => toMetadataEntry(field))
      .filter((field): field is NonNullable<typeof field> => Boolean(field));

    return res.json({ success: true, data: metadata });
  } catch (error) {
    console.error('Get object field metadata error:', error);
    return res.status(500).json({ success: false, error: 'Unable to load field metadata' });
  }
});

export default router;
