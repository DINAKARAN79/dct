"use client";

import * as React from "react";
import { ChevronDown, Search, UserRound, X } from "lucide-react";
import { userApi } from "@/lib/api";
import { LoggedInBadge } from "@/components/crm/logged-in-badge";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

export interface LookupUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  profile?: { name?: string | null } | null;
  isActive?: boolean;
  isLoggedIn?: boolean;
  lastSeenAt?: string | null;
}

interface UserLookupProps {
  id: string;
  users: LookupUser[];
  value: string;
  onChange: (userId: string) => void;
  excludedUserIds?: string[];
  placeholder?: string;
  selectedUser?: LookupUser | null;
  ariaLabel?: string;
  localSearch?: boolean;
  emptyMessage?: string;
  compact?: boolean;
  disabled?: boolean;
  showDetails?: boolean;
  openOnFocus?: boolean;
}

export function UserLookup({
  id,
  users,
  value,
  onChange,
  excludedUserIds = [],
  placeholder = "Search users...",
  selectedUser: selectedUserFallback,
  ariaLabel,
  localSearch = false,
  emptyMessage = "No users found.",
  compact = false,
  disabled = false,
  showDetails = true,
  openOnFocus = true,
}: UserLookupProps) {
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [recentUsers, setRecentUsers] = React.useState<LookupUser[]>([]);
  const [matches, setMatches] = React.useState<LookupUser[]>([]);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchFailed, setSearchFailed] = React.useState(false);
  const selectedUser = users.find((user) => user.id === value)
    || recentUsers.find((user) => user.id === value)
    || matches.find((user) => user.id === value)
    || (selectedUserFallback?.id === value ? selectedUserFallback : undefined);
  const normalizedQuery = query.trim().toLowerCase();
  const excludedUserIdsKey = excludedUserIds.join("|");
  const matchesQuery = (user: LookupUser, searchQuery: string) => {
    const searchableText = `${user.firstName} ${user.lastName} ${user.email} ${user.profile?.name || ""}`.toLowerCase();
    return searchQuery.split(/\s+/).filter(Boolean).every((term) => searchableText.includes(term));
  };

  React.useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  React.useEffect(() => {
    if (disabled || localSearch) {
      setMatches([]);
      setSearchFailed(false);
      setSearchLoading(false);
      return;
    }
    if (!open || !normalizedQuery) {
      setMatches([]);
      setSearchFailed(false);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchFailed(false);
      try {
        const response = await userApi.list({ search: query.trim(), isActive: true, limit: 100 });
        const excluded = new Set(excludedUserIdsKey.split("|").filter(Boolean));
        if (!cancelled) setMatches((response.data.data || []).filter((user: LookupUser) => user.isActive && !excluded.has(user.id)));
      } catch {
        if (!cancelled) {
          setMatches([]);
          setSearchFailed(true);
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [disabled, excludedUserIdsKey, localSearch, normalizedQuery, open, query]);

  const visibleUsers = normalizedQuery
    ? localSearch
      ? users.filter((user) => matchesQuery(user, normalizedQuery) && !excludedUserIds.includes(user.id))
      : matches
    : (recentUsers.length ? recentUsers : users).filter((user) => !excludedUserIds.includes(user.id));

  const selectUser = (user: LookupUser) => {
    onChange(user.id);
    setRecentUsers((current) => [user, ...current.filter((recentUser) => recentUser.id !== user.id)].slice(0, 5));
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} className="relative min-w-0">
          <div className={`flex items-center border bg-background focus-within:ring-2 focus-within:ring-ring ${
            compact ? "min-h-9 gap-1 rounded-md border-slate-400 px-2" : "min-h-10 gap-2 rounded-md px-3"
          }`}>
            {compact && !selectedUser && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-sky-600" aria-hidden="true">
                <UserRound className="h-4 w-4" />
                <ChevronDown className="h-3 w-3" />
              </span>
            )}
            {selectedUser && <span className="inline-flex min-w-0 items-center gap-2 rounded-md bg-muted px-2 py-1 text-sm">
              <UserRound className="h-4 w-4 shrink-0 text-primary" />
              <span className="max-w-[180px] truncate">{selectedUser.firstName} {selectedUser.lastName}</span>
              <LoggedInBadge online={Boolean(selectedUser.isLoggedIn)} lastSeenAt={selectedUser.lastSeenAt} />
              <button type="button" aria-label="Clear selected user" className="text-muted-foreground hover:text-foreground" onClick={() => { onChange(""); setQuery(""); }}><X className="h-4 w-4" /></button>
            </span>}
            <input
              id={id}
              aria-label={ariaLabel}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={`${id}-options`}
              autoComplete="off"
              disabled={disabled}
              className={`${compact ? "h-8" : "h-9"} min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60`}
              placeholder={selectedUser ? "" : placeholder}
              ref={inputRef}
              value={query}
              onFocus={() => { if (!disabled && openOnFocus) setOpen(true); }}
              onChange={(event) => { if (!disabled) { setQuery(event.target.value); setOpen(true); } }}
            />
            <button
              type="button"
              aria-label={ariaLabel ? `Search ${ariaLabel}` : "Search users"}
              className="shrink-0 p-1 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                if (disabled) return;
                inputRef.current?.focus();
                setOpen(true);
              }}
            >
              <Search className="h-5 w-5" />
            </button>
          </div>
        </div>
      </PopoverAnchor>
      <PopoverContent
        id={`${id}-options`}
        role="listbox"
        align="start"
        side="bottom"
        avoidCollisions={false}
        sideOffset={4}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          const target = event.target;
          if (target instanceof Node && anchorRef.current?.contains(target)) {
            event.preventDefault();
          }
        }}
        className={`z-[60] w-[var(--radix-popover-trigger-width)] overflow-y-auto overscroll-contain border bg-popover text-popover-foreground shadow-md [scrollbar-color:#7dd3fc_transparent] [scrollbar-width:thin] ${
          compact
            ? "max-h-[min(9rem,35vh)] rounded-md border-slate-300 p-1"
            : `rounded-xl border-sky-200 p-2 ${
                normalizedQuery && visibleUsers.length >= 3
                  ? "max-h-[min(22rem,55vh)] min-h-[min(15rem,50vh)]"
                  : "max-h-[min(22rem,55vh)]"
              }`
        }`}
      >
        {normalizedQuery
          ? searchLoading
            ? <p className="px-2 py-2 text-sm text-muted-foreground">Searching users...</p>
            : searchFailed
              ? <p className="px-2 py-2 text-sm text-destructive">Search failed. Try again.</p>
              : visibleUsers.length
                ? <>
                    {!compact && visibleUsers.length > 3 && (
                      <p className="px-2 py-1 text-xs text-muted-foreground" aria-live="polite">
                        {visibleUsers.length} matches. Scroll to see all users.
                      </p>
                    )}
                    {visibleUsers.map((user) => <UserLookupOption key={user.id} user={user} onSelect={selectUser} compact={compact} showDetails={showDetails} />)}
                  </>
                : <p className="px-2 py-2 text-sm text-muted-foreground">{emptyMessage}</p>
          : <>
              {!compact && <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Recent Items</p>}
              {visibleUsers.length ? visibleUsers.map((user) => <UserLookupOption key={user.id} user={user} onSelect={selectUser} compact={compact} showDetails={showDetails} />) : <p className="px-2 py-2 text-sm text-muted-foreground">No users available.</p>}
            </>}
      </PopoverContent>
    </Popover>
  );
}

function UserLookupOption({
  user,
  onSelect,
  compact = false,
  showDetails = true,
}: {
  user: LookupUser;
  onSelect: (user: LookupUser) => void;
  compact?: boolean;
  showDetails?: boolean;
}) {
  return <button
    type="button"
    role="option"
    aria-selected="false"
    className={`flex w-full items-center text-left hover:bg-sky-50 ${
      compact ? "gap-2 rounded px-2 py-1" : "gap-4 rounded-lg px-3 py-3"
    }`}
    onPointerDown={(event) => event.preventDefault()}
    onClick={() => onSelect(user)}
  >
      <span className={`flex shrink-0 items-center justify-center rounded-full bg-sky-600 text-white ${
        compact ? "h-5 w-5" : "h-11 w-11"
      }`}><UserRound className={compact ? "h-3.5 w-3.5" : "h-6 w-6"} /></span>
      <span className="min-w-0">
        <span className={`flex items-center gap-2 truncate font-semibold text-[#075d91] ${
          compact ? "text-sm" : "text-base"
        }`}>
          {user.firstName} {user.lastName}
          {!compact && <LoggedInBadge online={Boolean(user.isLoggedIn)} lastSeenAt={user.lastSeenAt} />}
        </span>
        {!compact && showDetails && (
          <>
            <span className="block truncate text-sm text-[#1479a8]">{user.email}</span>
            {user.profile?.name && <span className="block truncate text-xs text-muted-foreground">{user.profile.name}</span>}
          </>
        )}
      </span>
  </button>;
}
