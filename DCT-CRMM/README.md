# DCT-CRM

Enterprise Multi-Tenant CRM with dynamic object management, role-based access control, and permission-based authorization.

## Tech Stack

- **Frontend:** Next.js 14 (App Router), shadcn/ui, TypeScript
- **Backend:** Express.js, TypeScript
- **Database:** PostgreSQL, Prisma ORM
- **Auth:** JWT (HTTP-only cookies)

## Features

- Multi-tenant architecture with Super Admin
- Dynamic Object Manager (create custom objects/fields at runtime)
- Role-based access control (RBAC) with profiles, permission sets, and direct permissions
- 100 granular permissions across 20 modules
- Standard Lead fields (27 fields with picklists)
- Dynamic forms, tables, and detail views
- CRM workflow engine with status transitions
- Audit logging and activity tracking

## Getting Started

```bash
# Install dependencies
npm install

# Set up database
cd packages/db
npx prisma db push
npx ts-node src/seed-super-admin.ts
npx ts-node src/seed.ts
npx ts-node src/seed-lead-fields.ts

# Start API server
cd apps/api
npm run dev

# Start Web server
cd apps/web
npm run dev
```

## Login Credentials

| Email                   | Password    | Role        |
| ----------------------- | ----------- | ----------- |
| superadmin@dctcrm.com   | password123 | Super Admin |
| admin@dctcrm.com        | password123 | Admin       |
| salesmanager@dctcrm.com | password123 | Manager     |
| priya@dctcrm.com        | password123 | Sales       |
| amit@dctcrm.com         | password123 | Sales       |
| neha@dctcrm.com         | password123 | Presales    |
| finance@dctcrm.com      | password123 | Finance     |

## Project Structure

```
dct-crm/
├── apps/
│   ├── api/          # Express.js backend
│   └── web/          # Next.js frontend
├── packages/
│   ├── db/           # Prisma schema & migrations
│   └── shared/       # Shared Zod schemas
```
