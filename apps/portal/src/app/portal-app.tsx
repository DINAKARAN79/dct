'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cpDashboardReportHref, cpDashboardReports, getCpDashboardReport } from './cp-portal-reports';

type CPUser = { id: string; email: string; name: string };
type PortalNote = { id: string; category: string; text: string; createdAt: string };
type CRMNote = { id: string; subject: string; description: string | null; createdAt: string; user: { firstName: string; lastName: string } };
type Lead = {
  id: string; leadNumber: string | null; firstName: string | null; lastName: string;
  email: string | null; secondaryEmail: string | null; phone: string | null;
  secondaryPhone: string | null; tertiaryPhone: string | null; projectId: string | null; budget: number | null;
  sqftRange: string | null; bhkSize: string | null; propertyType: string | null;
  source: string; status: string; rating: string | null; validity: string | null;
  cpPortalType: 'Existing' | 'New'; cpPortalStatus: 'No Count' | 'Count';
  cpPortalSubmission?: boolean;
  createdAt: string; description: string | null; invoiceRaised: boolean;
  isRegistered: boolean; cancelledAfterBooking: boolean;
  project: { id: string; name: string } | null;
  siteVisits: Array<{ id: string; status: string; completedAt: string | null }>;
  bookings: Array<{ id: string; status: string; payments: Array<{ id: string }> }>;
  activities: CRMNote[]; cpPortalNotes: PortalNote[];
};
type Project = {
  id: string; name: string; description: string | null; address: string | null;
  city: string | null; state: string | null; projectType: string | null;
  totalUnits: number | null; availableUnits: number; priceRange: string | null;
  possessionDate: string | null; cpCommission: string | null;
  commissionAmount: number | null; brochureUrl: string | null; updatedAt: string;
};

const phoneCountries = [
  { name: 'India', code: '91', flag: '🇮🇳' },
  { name: 'United States', code: '1', flag: '🇺🇸' },
  { name: 'United Kingdom', code: '44', flag: '🇬🇧' },
  { name: 'United Arab Emirates', code: '971', flag: '🇦🇪' },
  { name: 'Australia', code: '61', flag: '🇦🇺' },
  { name: 'Canada', code: '1', flag: '🇨🇦' },
  { name: 'Singapore', code: '65', flag: '🇸🇬' },
];

const API = '/api/cp-portal';
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString() : '—';
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
const fullName = (lead: Lead) => [lead.firstName, lead.lastName].filter(Boolean).join(' ');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  const result = await response.json();
  if (!response.ok || result.success === false) {
    throw new Error(result.error || result.message || 'Request failed');
  }
  return result.data as T;
}

export function CPPortalApp({ page }: { page: 'login' | 'dashboard' | 'leads' | 'new-lead' | 'projects' | 'lead-notes' | 'reset-password' }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<CPUser | null>(null);
  const [authLoading, setAuthLoading] = useState(page !== 'login');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (page === 'login') {
      setAuthLoading(false);
      return;
    }
    let active = true;
    request<CPUser>('/me')
      .then((cp) => { if (active) setUser(cp); })
      .catch(() => { if (active) router.replace('/login'); })
      .finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, [page, router]);

  const signOut = async () => {
    try {
      await request('/logout', { method: 'POST' });
    } finally {
      setUser(null);
      router.replace('/login');
    }
  };

  if (page === 'login') {
    return <LoginPage router={router} setError={setError} error={error} />;
  }
  if (authLoading || !user) {
    return <div className="cp-loading"><span className="cp-spinner" />Checking your CP session…</div>;
  }
  return (
    <div className="cp-layout">
      <aside className="cp-sidebar">
        <a className="cp-brand" href="/"><span className="cp-brand-mark">CP</span><span><b>Partner Portal</b><small>Channel Partner workspace</small></span></a>
        <div className="cp-nav-label">WORKSPACE</div>
        <nav className="cp-nav">
          <NavLink href="/" active={pathname === '/'} icon="▦">Dashboard</NavLink>
          <NavLink href="/leads" active={pathname === '/leads' || (pathname.startsWith('/leads/') && pathname !== '/leads/new')} icon="☷">All Leads</NavLink>
          <NavLink href="/leads/new" active={pathname === '/leads/new'} icon="+">Add New Lead</NavLink>
          <NavLink href="/projects" active={pathname === '/projects'} icon="⌂">Projects</NavLink>
        </nav>
        <div className="cp-sidebar-bottom">
          <div className="cp-help"><span>✦</span><b>Need help?</b><small>Reach out to your CRM administrator.</small></div>
          <button className="cp-nav-item cp-logout" onClick={() => void signOut()}><span className="cp-nav-icon">↪</span>Log out</button>
        </div>
      </aside>
      <main className="cp-main">
        <header className="cp-topbar">
          <div><span className="cp-top-eyebrow">CHANNEL PARTNER PORTAL</span><strong>{pageTitle(page)}</strong></div>
          <div className="cp-user-menu"><div className="cp-avatar">{user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div><span><b>{user.name}</b><small>{user.email}</small></span><a href="/reset-password" className="cp-account-link" title="Password settings">⚙</a></div>
        </header>
        <section className="cp-content">
          {notice && <div className="cp-alert cp-alert-success" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div>}
          {error && <div className="cp-alert cp-alert-error" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}
          {page === 'dashboard' && <Dashboard setError={setError} router={router} />}
          {page === 'leads' && <Leads setError={setError} />}
          {page === 'new-lead' && <NewLead setError={setError} setNotice={setNotice} router={router} />}
          {page === 'projects' && <Projects setError={setError} />}
          {page === 'lead-notes' && <LeadNotes leadId={pathname.split('/').filter(Boolean).at(-1) || ''} setError={setError} setNotice={setNotice} />}
          {page === 'reset-password' && <ResetPassword user={user} setError={setError} setNotice={setNotice} />}
        </section>
      </main>
    </div>
  );
}

function pageTitle(page: string) {
  return ({ dashboard: 'Dashboard', leads: 'All Leads', 'new-lead': 'Add New Lead', projects: 'Projects', 'lead-notes': 'Lead Notes', 'reset-password': 'Account Settings' } as Record<string, string>)[page] || 'Dashboard';
}

function NavLink({ href, active, icon, children }: { href: string; active: boolean; icon: string; children: ReactNode }) {
  return <a href={href} className={`cp-nav-item${active ? ' active' : ''}`}><span className="cp-nav-icon">{icon}</span>{children}{active && <span className="cp-nav-active" />}</a>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="cp-page-heading"><div><div className="cp-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function LoginPage({ router, error, setError }: { router: ReturnType<typeof useRouter>; error: string; setError: (value: string) => void }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await request('/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
      router.replace('/');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="cp-login">
      <div className="cp-login-art"><div className="cp-login-art-inner"><div className="cp-login-logo">CP</div><span className="cp-kicker">BUILT FOR YOUR GROWTH</span><h1>Better partnerships.<br /><em>Stronger results.</em></h1><p>Your projects, leads, and performance — all in one place.</p><div className="cp-art-stats"><div><b>01</b><span>Your leads</span></div><div><b>02</b><span>Live projects</span></div><div><b>03</b><span>One workspace</span></div></div></div><div className="cp-orb cp-orb-one" /><div className="cp-orb cp-orb-two" /></div>
      <div className="cp-login-panel"><div className="cp-login-form-wrap"><a className="cp-mobile-brand" href="/login"><span className="cp-brand-mark">CP</span> Partner Portal</a><span className="cp-eyebrow">WELCOME BACK</span><h2>Sign in to your portal</h2><p className="cp-login-subtitle">Enter your account details to continue.</p>
        {error && <div className="cp-alert cp-alert-error" role="alert">{error}</div>}
        <form onSubmit={submit} className="cp-form cp-login-form">
          <label>Username or email<input type="text" autoComplete="username" placeholder="Enter your portal username or email" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button className="cp-button cp-button-primary cp-button-full" disabled={loading}>{loading ? 'Signing in…' : 'Sign In'} <span>→</span></button>
        </form>
        <div className="cp-login-foot">Use the username and password managed in your CP Portal Account, separate from CRM sign-in.</div>
      </div><footer>© {new Date().getFullYear()} Partner Portal</footer></div>
    </div>
  );
}

type Filters = { projectId: string; from: string; to: string };
const blankFilters: Filters = { projectId: '', from: '', to: '' };

function Dashboard({ setError, router }: { setError: (value: string) => void; router: ReturnType<typeof useRouter> }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [draft, setDraft] = useState(blankFilters);
  const [filters, setFilters] = useState(blankFilters);
  const [data, setData] = useState<{ stats: Record<string, number>; recentLeads: Array<{ id: string; leadNumber: string | null; firstName: string | null; lastName: string; status: string; createdAt: string; project: { name: string } | null }> } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { request<Project[]>('/projects').then(setProjects).catch((e) => setError(e.message)); }, [setError]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.projectId) params.set('projectId', filters.projectId);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    request<typeof data>(`/dashboard?${params}`).then((result) => { if (active) setData(result); }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, setError]);
  const stats = data?.stats;
  return <>
    <PageHeading eyebrow="OVERVIEW" title="Your dashboard" description="A clear view of your leads and partner performance." action={<a href="/leads/new" className="cp-button cp-button-primary">＋ Add New Lead</a>} />
    <div className="cp-filter-card"><div className="cp-filter-heading"><div><b>Filter overview</b><small>Refine statistics by project and lead creation date.</small></div><span className="cp-filter-glyph">⌕</span></div><div className="cp-filter-controls">
      <label>PROJECT<select value={draft.projectId} onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}><option value="">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>FROM DATE<input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
      <label>TO DATE<input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></label>
      <button className="cp-button cp-button-primary" onClick={() => setFilters(draft)}>Apply Filter</button>
      <button className="cp-button cp-button-plain" onClick={() => { setDraft(blankFilters); setFilters(blankFilters); }}>Clear Filter</button>
    </div></div>
    <div className="cp-section-label">PERFORMANCE SNAPSHOT</div>
    <div className="cp-metric-grid">{cpDashboardReports.map((report) => {
      const value = report.tracked
        ? stats?.[report.statKey] ?? 0
        : 'Not tracked';
      return <button
        type="button"
        className="cp-metric-card"
        key={report.id}
        onClick={() => router.push(cpDashboardReportHref(report.id, filters))}
        aria-label={`View ${report.label} report in All Leads`}
      >
        <div className={`cp-metric-icon ${report.color}`}>{report.icon}</div>
        <div className="cp-metric-label">{report.label}</div>
        <strong>{loading ? '—' : value}</strong>
        <small>{report.tracked ? 'Based on your CP leads' : 'Report data is not tracked'}</small>
      </button>;
    })}</div>
    <section className="cp-panel cp-recent-panel"><div className="cp-panel-heading"><div><h2>Recent leads</h2><p>Your latest lead activity</p></div><a className="cp-text-link" href="/leads">View all leads <span>→</span></a></div><LeadRows leads={data?.recentLeads || []} loading={loading} /></section>
  </>;
}

function LeadRows({ leads, loading }: { leads: Array<{ id: string; leadNumber: string | null; firstName: string | null; lastName: string; status: string; createdAt: string; project: { name: string } | null }>; loading: boolean }) {
  return <div className="cp-table-wrap"><table className="cp-table cp-recent-table"><thead><tr><th>LEAD</th><th>PROJECT</th><th>STAGE</th><th>CREATED</th><th /></tr></thead><tbody>
    {loading ? <tr><td colSpan={5} className="cp-empty">Loading leads…</td></tr> : leads.length ? leads.map((lead) => <tr key={lead.id}><td><b>{[lead.firstName, lead.lastName].filter(Boolean).join(' ')}</b><small>{lead.leadNumber || lead.id.slice(-8)}</small></td><td>{lead.project?.name || '—'}</td><td><StatusPill value={lead.status} /></td><td>{formatDate(lead.createdAt)}</td><td><a className="cp-row-arrow" href={`/leads/${lead.id}`}>→</a></td></tr>) : <tr><td colSpan={5} className="cp-empty">No leads found for these filters.</td></tr>}
  </tbody></table></div>;
}

function StatusPill({ value }: { value: string }) {
  const key = value.toLowerCase().replaceAll('_', ' ');
  return <span className={`cp-status cp-status-${key.replaceAll(' ', '-')}`}>{key}</span>;
}

function Leads({ setError }: { setError: (value: string) => void }) {
  const searchParams = useSearchParams();
  const report = getCpDashboardReport(searchParams.get('report'));
  const reportId = report?.id;
  const reportUnavailable = report !== null && !report.tracked;
  const projectId = searchParams.get('projectId') || '';
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('all');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (stage !== 'all') params.set('stage', stage);
      if (reportId) params.set('report', reportId);
      if (projectId) params.set('projectId', projectId);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (reportUnavailable) {
        setLeads([]);
        return;
      }
      setLeads(await request<Lead[]>(`/leads?${params}`));
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load leads'); }
    finally { setLoading(false); }
  }, [search, stage, reportId, reportUnavailable, projectId, from, to, setError]);
  useEffect(() => { const timer = setTimeout(() => void load(), 180); return () => clearTimeout(timer); }, [load]);
  const exportCsv = () => {
    const columns = ['Lead ID', 'Lead Name', 'Primary Email', 'Primary Phone', 'Secondary Email', 'Secondary Phone', 'Tertiary Phone', 'Project', 'Budget', 'SQFT Range', 'BHK Size', 'Property Type', 'Type', 'Status', 'Validity', 'Created Date', 'Site Visit', 'Stage', 'Recent Notes', 'CRM/Sales Notes'];
    const rows = leads.map((lead) => [
      lead.leadNumber || lead.id, fullName(lead), lead.email, lead.phone, lead.secondaryEmail, lead.secondaryPhone, lead.tertiaryPhone,
      lead.project?.name, lead.budget, lead.sqftRange, lead.bhkSize, lead.propertyType, lead.cpPortalType, lead.cpPortalStatus,
      lead.validity, lead.createdAt, lead.siteVisits[0]?.status || '—', lead.rating,
      lead.cpPortalNotes[0]?.text, lead.activities[0]?.description || lead.activities[0]?.subject,
    ]);
    const quote = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const csv = [columns, ...rows].map((row) => row.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'cp-leads.csv'; link.click(); URL.revokeObjectURL(url);
  };
  return <>
    <PageHeading eyebrow="YOUR PIPELINE" title="All leads" description={report ? `Showing the ${report.label} report for your account.` : 'Search, review, and manage leads registered under your account.'} action={<a href="/leads/new" className="cp-button cp-button-primary">＋ Add New Lead</a>} />
    <div className="cp-panel cp-leads-panel"><div className="cp-list-toolbar"><div className="cp-search"><span>⌕</span><input placeholder="Search name, email, or project…" value={search} onChange={(e) => setSearch(e.target.value)} /></div><select className="cp-toolbar-select" value={stage} onChange={(e) => setStage(e.target.value)}><option value="all">All stages</option><option value="cold">Cold</option><option value="warm">Warm</option><option value="hot">Hot</option><option value="lost">Lost</option></select><button className="cp-button cp-button-outline" onClick={exportCsv}>⇩ Export CSV</button></div>
      {report && !report.tracked ? <div className="cp-report-unavailable" role="status">{report.unavailableMessage}</div> : <>
        <div className="cp-table-wrap"><table className="cp-table cp-leads-table"><thead><tr><th>LEAD</th><th>PRIMARY CONTACT</th><th>SECONDARY CONTACT</th><th>TERTIARY PHONE</th><th>PROJECT</th><th>BUDGET</th><th>PROPERTY DETAILS</th><th>TYPE</th><th>STATUS</th><th>VALIDITY</th><th>CREATED</th><th>SITE VISIT</th><th>STAGE</th><th>RECENT CP NOTE</th><th>CRM / SALES NOTE</th><th /></tr></thead><tbody>
          {loading ? <tr><td colSpan={16} className="cp-empty">Loading your leads…</td></tr> : leads.length ? leads.map((lead) => <tr key={lead.id}><td><b>{fullName(lead)}</b><small>{lead.leadNumber || lead.id.slice(-8)}</small></td><td><b>{lead.phone || '—'}</b><small>{lead.email || '—'}</small></td><td><b>{lead.secondaryPhone || '—'}</b><small>{lead.secondaryEmail || '—'}</small></td><td>{lead.tertiaryPhone || '—'}</td><td>{lead.project?.name || '—'}</td><td>{lead.budget != null ? money(lead.budget) : '—'}</td><td><b>{lead.bhkSize || '—'}</b><small>{[lead.propertyType, lead.sqftRange].filter(Boolean).join(' · ') || '—'}</small></td><td>{lead.cpPortalType}</td><td><StatusPill value={lead.cpPortalStatus} /></td><td>{lead.validity || '—'}</td><td>{formatDate(lead.createdAt)}</td><td>{lead.siteVisits[0]?.status?.toLowerCase().replaceAll('_', ' ') || '—'}</td><td><span className="cp-stage-label">{lead.rating?.toLowerCase() || 'unrated'}</span></td><td><small>{lead.cpPortalNotes[0]?.text || '—'}</small></td><td><small>{lead.activities[0]?.description || lead.activities[0]?.subject || '—'}</small></td><td>{lead.cpPortalSubmission ? '—' : <a className="cp-row-arrow" aria-label={`View notes for ${fullName(lead)}`} href={`/leads/${lead.id}`}>→</a>}</td></tr>) : <tr><td colSpan={16} className="cp-empty">No leads match your report, search, or stage filters.</td></tr>}
        </tbody></table></div><div className="cp-table-foot">Showing <b>{leads.length}</b> CP submission entr{leads.length === 1 ? 'y' : 'ies'}</div>
      </>}
    </div>
  </>;
}

function NewLead({ setError, setNotice, router }: { setError: (value: string) => void; setNotice: (value: string) => void; router: ReturnType<typeof useRouter> }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [saving, setSaving] = useState(false);
  const initial = { fullName: '', email: '', secondaryEmail: '', phone: '', secondaryPhone: '', country: 'India', countryCode: '91', secondaryCountry: 'India', secondaryCountryCode: '91', projectId: '', budget: '', sqftRange: '', bhkSize: '', propertyType: '', stage: '', remarks: '' };
  const [form, setForm] = useState(initial);
  const submissionId = useRef<string | null>(null);
  useEffect(() => { request<Project[]>('/projects').then(setProjects).catch((e) => setError(e.message)); }, [setError]);
  const update = (key: keyof typeof initial, value: string) => {
    submissionId.current = null;
    setForm((current) => ({ ...current, [key]: value }));
  };
  const updateCountry = (key: 'country' | 'secondaryCountry', value: string) => {
    const country = phoneCountries.find((option) => option.name === value);
    if (!country) return;
    setForm((current) => ({
      ...current,
      [key]: country.name,
      [key === 'country' ? 'countryCode' : 'secondaryCountryCode']: country.code,
    }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setSaving(true);
    try {
      submissionId.current ||= crypto.randomUUID();
      const result = await request<{ message: string; assignmentWarning?: string; cpPortalType: 'Existing' | 'New'; cpPortalStatus: 'No Count' | 'Count' }>('/leads', { method: 'POST', headers: { 'Idempotency-Key': submissionId.current }, body: JSON.stringify({ ...form, budget: form.budget, stage: form.stage || 'cold', leadStatus: 'NEW', leadSource: 'CHANNEL_PARTNER', bhkSize: form.bhkSize === 'Select BHK' ? '' : form.bhkSize, propertyType: form.propertyType === 'Select Type' ? '' : form.propertyType }) });
      if (result.assignmentWarning) {
        setForm(initial);
        submissionId.current = null;
        setError(`${result.assignmentWarning} Type: ${result.cpPortalType}; Status: ${result.cpPortalStatus}.`);
        return;
      }
      submissionId.current = null;
      setForm(initial);
      setNotice(`${result.message || 'Lead Registered Successfully'} Type: ${result.cpPortalType}; Status: ${result.cpPortalStatus}.`);
      router.push('/leads');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to register lead'); }
    finally { setSaving(false); }
  };
  return <>
    <PageHeading eyebrow="LEAD MANAGEMENT" title="Add a new lead" description="Add a prospective buyer to your channel partner pipeline." />
    <form className="cp-panel cp-form-panel cp-new-lead-form" onSubmit={submit}>
      <div className="cp-new-lead-fields">
        <Field label="Full Name" required><input value={form.fullName} onChange={(e) => update('fullName', e.target.value)} placeholder="Enter full name" required maxLength={200} /></Field>
        <Field label="Primary Email"><input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="Enter primary email" /></Field>
        <Field label="Secondary Email"><input type="email" value={form.secondaryEmail} onChange={(e) => update('secondaryEmail', e.target.value)} placeholder="Enter secondary email" /></Field>
        <PhoneField label="Primary Phone" required value={form.phone} country={form.country} onCountryChange={(value) => updateCountry('country', value)} onChange={(value) => update('phone', value)} placeholder="Enter phone number" />
        <PhoneField label="Secondary Phone" value={form.secondaryPhone} country={form.secondaryCountry} onCountryChange={(value) => updateCountry('secondaryCountry', value)} onChange={(value) => update('secondaryPhone', value)} placeholder="Enter secondary phone" />
        <Field label="Project Name" required><select value={form.projectId} onChange={(e) => update('projectId', e.target.value)} required><option value="">Select Project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Budget Range" required><input type="number" min="0" step="1" value={form.budget} onChange={(e) => update('budget', e.target.value)} placeholder="e.g., 50L - 1Cr" required /></Field>
        <Field label="SQFT Range"><input value={form.sqftRange} onChange={(e) => update('sqftRange', e.target.value)} placeholder="e.g., 1000-1500" /></Field>
        <Field label="BHK Size"><select value={form.bhkSize} onChange={(e) => update('bhkSize', e.target.value)}><option value="">Select BHK</option><option>1 BHK</option><option>2 BHK</option><option>3 BHK</option><option>4 BHK</option><option>5+ BHK</option></select></Field>
        <Field label="Property Type"><select value={form.propertyType} onChange={(e) => update('propertyType', e.target.value)}><option value="">Select Type</option><option>Apartment</option><option>Villa</option><option>Plot</option><option>Commercial</option><option>Other</option></select></Field>
        <Field label="Stage"><select value={form.stage} onChange={(e) => update('stage', e.target.value)}><option value="">Select stage</option><option value="cold">Cold</option><option value="warm">Warm</option><option value="hot">Hot</option></select></Field>
        <Field label="Initial Remarks"><textarea rows={3} value={form.remarks} onChange={(e) => update('remarks', e.target.value)} placeholder="Enter any initial remarks about this lead…" maxLength={4000} /></Field>
      </div>
      <div className="cp-form-actions"><button type="button" className="cp-button cp-button-outline" onClick={() => { submissionId.current = null; setForm(initial); }}>Clear Form</button><button className="cp-button cp-button-primary" disabled={saving}>{saving ? 'Registering…' : '＋ Add Lead'}</button></div>
    </form>
  </>;
}

function PhoneField({
  label, required, value, country, onCountryChange, onChange, placeholder,
}: {
  label: string; required?: boolean; value: string; country: string;
  onCountryChange: (value: string) => void; onChange: (value: string) => void; placeholder: string;
}) {
  return <Field label={label} required><div className="cp-phone-input">
    <select aria-label={`${label} country`} value={country} onChange={(event) => onCountryChange(event.target.value)}>
      {phoneCountries.map((option) => <option key={option.name} value={option.name}>{option.flag} +{option.code}</option>)}
    </select>
    <input type="tel" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} maxLength={40} />
  </div></Field>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <label className="cp-field">{label}{required && <span className="cp-required"> *</span>}{children}</label>;
}

function Projects({ setError }: { setError: (value: string) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { request<Project[]>('/projects').then(setProjects).catch((e) => setError(e.message)).finally(() => setLoading(false)); }, [setError]);
  const brochure = async (project: Project) => {
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    try {
      const result = await request<{ url: string }>(`/projects/${project.id}/brochure`);
      if (popup) popup.location.href = result.url;
      else window.location.href = result.url;
    } catch (e) {
      popup?.close();
      setError(e instanceof Error ? e.message : 'Brochure not found');
    }
  };
  return <>
    <PageHeading eyebrow="AVAILABLE INVENTORY" title="Our projects" description="Explore the projects available to your channel partner account." />
    {loading ? <div className="cp-panel cp-empty">Loading projects…</div> : projects.length ? <div className="cp-project-grid">{projects.map((project) => <article className="cp-project-card" key={project.id}><div className="cp-project-art"><span className="cp-project-tag">{project.projectType || 'RESIDENTIAL'}</span><span className="cp-project-building">⌂</span><span className="cp-project-art-name">{project.name}</span></div><div className="cp-project-body"><div className="cp-project-location">⌖ { [project.city, project.state].filter(Boolean).join(', ') || project.address || 'Location not specified' }</div><h2>{project.name}</h2><p>{project.description || 'Discover thoughtfully planned homes in a well-connected location.'}</p><div className="cp-project-facts"><div><small>UNITS</small><b>{project.totalUnits ?? '—'}</b></div><div><small>AVAILABLE</small><b>{project.availableUnits}</b></div><div><small>PRICE RANGE</small><b>{project.priceRange || 'Contact us'}</b></div></div><div className="cp-project-commission"><span>CP commission</span><b>{project.commissionAmount != null ? money(project.commissionAmount) : project.cpCommission || 'Contact administrator'}</b></div><div className="cp-project-footer"><span>Possession <b>{formatDate(project.possessionDate)}</b></span><button className="cp-button cp-button-outline" onClick={() => void brochure(project)}>↓ Brochure</button></div></div></article>)}</div> : <div className="cp-panel cp-empty">No active projects are available.</div>}
  </>;
}

function LeadNotes({ leadId, setError, setNotice }: { leadId: string; setError: (value: string) => void; setNotice: (value: string) => void }) {
  const [notes, setNotes] = useState<{ cpNotes: PortalNote[]; crmNotes: CRMNote[] } | null>(null);
  const [category, setCategory] = useState('Follow-up');
  const [text, setText] = useState('');
  const [leadName, setLeadName] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    try {
      const [result, leads] = await Promise.all([request<{ cpNotes: PortalNote[]; crmNotes: CRMNote[] }>(`/leads/${leadId}/notes`), request<Lead[]>('/leads')]);
      setNotes(result);
      const lead = leads.find((item) => item.id === leadId);
      setLeadName(lead ? fullName(lead) : '');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load notes'); }
  }, [leadId, setError]);
  useEffect(() => { void load(); }, [load]);
  const addNote = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await request(`/leads/${leadId}/notes`, { method: 'POST', body: JSON.stringify({ category, text }) });
      setText(''); setNotice('Note added successfully'); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to add note'); }
    finally { setSaving(false); }
  };
  return <>
    <PageHeading eyebrow="LEAD ACTIVITY" title="Lead notes" description={leadName ? `Notes and sales activity for ${leadName}.` : 'Review notes and activity for this lead.'} action={<a href="/leads" className="cp-button cp-button-outline">← Back to leads</a>} />
    <div className="cp-notes-layout"><section className="cp-panel cp-notes-panel"><div className="cp-panel-heading"><div><h2>Partner notes</h2><p>Notes added from your CP Portal</p></div></div><form className="cp-note-form" onSubmit={addNote}><Field label="Note category"><select value={category} onChange={(e) => setCategory(e.target.value)}><option>Follow-up</option><option>Call</option><option>Site Visit</option><option>Requirement</option><option>Other</option></select></Field><Field label="Note"><textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} required placeholder="Write an update…" maxLength={4000} /></Field><button className="cp-button cp-button-primary" disabled={saving}>{saving ? 'Saving…' : 'Add Note'}</button></form><div className="cp-notes-list">{(notes?.cpNotes || []).map((note) => <NoteCard key={note.id} title={note.category} text={note.text} createdAt={note.createdAt} />)}{notes && notes.cpNotes.length === 0 && <p className="cp-empty">No partner notes added yet.</p>}</div></section>
      <section className="cp-panel cp-notes-panel"><div className="cp-panel-heading"><div><h2>CRM / Sales notes</h2><p>Latest notes recorded by your CRM team</p></div></div><div className="cp-notes-list">{(notes?.crmNotes || []).map((note) => <NoteCard key={note.id} title={note.subject} text={note.description || '—'} createdAt={note.createdAt} author={`${note.user.firstName} ${note.user.lastName}`} />)}{notes && notes.crmNotes.length === 0 && <p className="cp-empty">No CRM or sales notes available.</p>}</div></section></div>
  </>;
}

function NoteCard({ title, text, createdAt, author }: { title: string; text: string; createdAt: string; author?: string }) {
  return <article className="cp-note-card"><span className="cp-note-dot" /><div><div className="cp-note-card-head"><b>{title}</b><time>{formatDate(createdAt)}</time></div><p>{text}</p>{author && <small>By {author}</small>}</div></article>;
}

function ResetPassword({ user, setError, setNotice }: { user: CPUser; setError: (value: string) => void; setNotice: (value: string) => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setSaving(true);
    try {
      const result = await request<{ message: string }>('/reset-password', { method: 'POST', body: JSON.stringify({ email: user.email, newPassword: password }) });
      setNotice(result.message); setPassword(''); setConfirm('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to reset password'); }
    finally { setSaving(false); }
  };
  return <><PageHeading eyebrow="SECURITY" title="Password settings" description="Update the password used to access your Channel Partner portal." /><form className="cp-panel cp-password-panel cp-form" onSubmit={submit}><div className="cp-form-section-title"><span className="cp-step">01</span><div><h2>Change your password</h2><p>For your security, use at least 8 characters.</p></div></div><Field label="Account email"><input type="email" value={user.email} readOnly /></Field><Field label="New password"><input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} required /></Field><Field label="Confirm new password"><input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></Field><div className="cp-form-actions"><button className="cp-button cp-button-primary" disabled={saving}>{saving ? 'Updating…' : 'Update Password'} <span>→</span></button></div></form></>;
}
