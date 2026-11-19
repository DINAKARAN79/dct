# Lead Creation API

This document is the source of truth for creating CRM Leads through the existing
canonical endpoint.

## Endpoint

`POST /api/leads`

The endpoint is used by the CRM UI and authenticated API clients. It creates the
same `Lead` model used by the rest of the CRM workflow.

For local development, the Express API listens on port `3001`. The Next.js app
listens on port `3000` and proxies unmatched `/api/*` requests to that API:

- Direct: `http://localhost:3001/api/leads`
- Through Next.js: `http://localhost:3000/api/leads`

## Authentication and tenant resolution

External API clients must authenticate with one active company API key:

```http
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

Or use the alternative header (do not send both):

```http
X-API-Key: <API_KEY>
Content-Type: application/json
```

The key must include the `leads:write` scope. The `tenantId` query parameter,
when supplied, must match the company associated with the key. The backend
derives the tenant from the authenticated key; a body-supplied `tenantId`
cannot override it. If custom-header-only mode is enabled, send only the
configured custom header.

CRM browser requests continue to use the existing session authentication.

Only authenticated `Admin` and `Presales` profiles may create Leads through
this endpoint. Super Admin access follows the existing authentication rules.

## Required payload

| Field | Type | Required | Purpose | Example |
|---|---|---:|---|---|
| `lastName` | string | Yes | Lead surname | `"Sharma"` |
| `phone` | string | Yes | Lead phone; whitespace is normalized | `"+91 9876543210"` |
| `company` | string | Yes | Company or organization | `"Example Realty"` |

## Optional and conditional payload

| Field | Type | Example |
|---|---|---|
| `firstName` | string | `"Anita"` |
| `salutation` | `MR \| MS \| MRS \| DR \| PROF` | `"MS"` |
| `title` | string | `"Director"` |
| `email` | email string | `"anita@example.com"` |
| `mobile` | string | `"+91 9000000000"` |
| `website` | URL string | `"https://example.com"` |
| `industry` | existing Industry value | `"REAL_ESTATE"` |
| `annualRevenue` | number | `2500000` |
| `numberOfEmployees` | integer | `25` |
| `source` | existing LeadSource value | `"WEBSITE"` |
| `rating` | `HOT \| WARM \| COLD` | `"WARM"` |
| `description` | string | `"Requested a project callback"` |
| `street`, `city`, `stateProvince`, `country`, `postalCode` | string | `"Chennai"` |
| `score` | number | `10` |
| `budget` | number | `7500000` |
| `requirements` | string | `"3 bedroom apartment"` |
| `notes` | string | `"Call after 5 PM"` |
| `projectName` | string | `"Example Project"` |

When the company's Pre-Sales round-robin queue requires a project,
`projectName` is required for lead creation. Use the exact name of an active
project belonging to the same company as the API key. The API resolves that
name to the internal project record; clients do not need to send a project ID.

The existing LeadSource values are `WEBSITE`, `REFERRAL`, `COLD_CALL`,
`ADVERTISEMENT`, `WALK_IN`, `PORTAL`, `INSTAGRAM`, `TWITTER`, `WHATSAPP`,
`YOUTUBE`, and `OTHER`.

## Fields rejected as client-controlled

Do not send these fields. The create schema excludes them:

- `tenantId`
- `companyId`
- `leadNumber`
- `ownerId`
- `status`
- `createdById`
- `createdAt`
- `updatedAt`

Unknown fields are not used to override server-owned values.

## Server-generated data

- `id`
- `tenantId`
- `creatorId`
- `leadNumber`
- `ownerId`
- `status`, always initially `NEW`
- `createdAt`
- `updatedAt`
- Presales Owner History
- Lead creation AuditLog

## Example Postman request

```http
POST http://localhost:3001/api/leads?tenantId=<COMPANY_TENANT_ID>
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

```json
{
  "firstName": "Anita",
  "lastName": "Sharma",
  "phone": "+91 9876543210",
  "email": "anita@example.com",
  "company": "Example Realty",
  "projectName": "<ACTIVE_PROJECT_NAME_FOR_THIS_COMPANY>",
  "source": "WEBSITE",
  "notes": "Requested a project callback"
}
```

## Response

The endpoint uses the existing response convention:

```json
{
  "success": true,
  "action": "NEW_LEAD",
  "leadId": "cm...",
  "data": {
    "id": "cm...",
    "tenantId": "cm...",
    "leadNumber": "LN000123",
    "firstName": "Anita",
    "lastName": "Sharma",
    "phone": "+919876543210",
    "company": "Example Realty",
    "source": "WEBSITE",
    "status": "NEW",
    "owner": {
      "id": "cm...",
      "firstName": "Priya",
      "lastName": "Sharma"
    },
    "project": null,
    "createdAt": "2026-09-24T12:30:00.000Z"
  }
}
```

New leads return HTTP `201`; duplicate matches may return HTTP `200` with the
existing lead action. The actual response does not expose passwords, JWTs, or
integration secrets.

For production, use the public API URL configured by `PUBLIC_API_BASE_URL`.
When the public CRM host proxies API requests, the endpoint is
`https://<CRM_HOST>/api/leads`; the Next.js server must also have `BACKEND_URL`
configured to reach the Express API.

## Assignment and workflow

Creation starts the Lead at `NEW` and follows the company's existing
Pre-Sales round-robin configuration. If that queue requires a project, include
the active company's `projectId`; otherwise the API returns `409` and does not
create the lead. Owner assignment and audit history follow the existing CRM
workflow.

## Duplicate handling

The canonical phone duplicate rule is shared with CRM creation. A duplicate
phone returns:

```json
{
  "success": false,
  "error": "Phone number already exists for another lead."
}
```

with HTTP `409`. The current schema does not contain a Meta external ID or
idempotency key, and no Meta webhook tenant-mapping mechanism exists in the
repository. Therefore, a secure Meta webhook endpoint is not claimed here.

## Error responses

- `400`: invalid or missing payload, for example missing `phone`
- `401`: missing or invalid authentication
- `403`: authenticated user lacks Lead create access or is not Admin/Presales
- `404`: referenced resources are not found by the relevant existing APIs
- `409`: duplicate phone
- `500`: unexpected server error

## Meta mapping status

There is no existing Meta webhook/integration implementation or secure
integration-secret-to-tenant mapping in this repository. Do not expose a public
Meta endpoint that accepts `tenantId`, `ownerId`, or `status`.

Once a tenant-bound integration credential exists, Meta input should be mapped
to the canonical payload above and submitted through the same Lead creation
service. Until then, Meta Lead Ads are not supported as an authenticated
server-to-server flow.

Conceptual mapping only:

| Meta input | Canonical CRM field |
|---|---|
| `full_name` | split into `firstName` and `lastName` |
| `phone_number` | `phone` |
| `email` | `email` |
| integration source | `source` using an existing LeadSource value |
| campaign metadata | `notes` or `description` only if supplied by an approved mapping |