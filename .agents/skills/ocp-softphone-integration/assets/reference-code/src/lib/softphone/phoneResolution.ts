/**
 * Client-side phone resolution for softphone screen pop.
 *
 * Mirrors backend `_shared/phone-resolution.ts` behaviour so that real
 * incoming PBX calls (which create the call record from the browser via
 * `createCallRecord`) honor `system_settings.phone_resolution_strategy`
 * (`legacy` | `newest` | `oldest` | `priority` | `manual` | `hybrid` | `off`).
 */
import { supabase } from '@/integrations/supabase/client';
import type { ResolutionCandidate } from '@/lib/calls/types';

export type ResolutionStrategy =
  | 'legacy'
  | 'newest'
  | 'oldest'
  | 'priority'
  | 'manual'
  | 'hybrid'
  | 'off';

export interface ResolutionConfig {
  strategy: ResolutionStrategy;
  hybridTiebreaker: 'newest' | 'oldest' | 'priority';
  maxCandidates: number;
}

export interface PhoneResolutionResult {
  contactId: string | null;
  companyId: string | null;
  candidates: ResolutionCandidate[] | null;
  effectiveStrategy: ResolutionStrategy;
}

const CFG_TTL_MS = 60_000;
let cfgCache: { value: ResolutionConfig; ts: number } | null = null;

export function clearPhoneResolutionConfigCache() {
  cfgCache = null;
}

export async function loadPhoneResolutionConfig(): Promise<ResolutionConfig> {
  const now = Date.now();
  if (cfgCache && now - cfgCache.ts < CFG_TTL_MS) return cfgCache.value;

  const fallback: ResolutionConfig = {
    strategy: 'legacy',
    hybridTiebreaker: 'newest',
    maxCandidates: 10,
  };

  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', [
        'phone_resolution_strategy',
        'phone_resolution_hybrid_tiebreaker',
        'phone_resolution_max_candidates',
      ]);
    if (error) {
      console.error('[phone-resolution] loadConfig error:', error);
      return fallback;
    }
    const map = new Map<string, unknown>();
    (data ?? []).forEach((r: { key: string; value: unknown }) => map.set(r.key, r.value));
    const cfg: ResolutionConfig = {
      strategy: (map.get('phone_resolution_strategy') as ResolutionStrategy) ?? 'legacy',
      hybridTiebreaker:
        (map.get('phone_resolution_hybrid_tiebreaker') as ResolutionConfig['hybridTiebreaker']) ??
        'newest',
      maxCandidates: Math.max(
        1,
        Math.min(50, Number(map.get('phone_resolution_max_candidates') ?? 10)),
      ),
    };
    cfgCache = { value: cfg, ts: now };
    return cfg;
  } catch (e) {
    console.error('[phone-resolution] loadConfig exception:', e);
    return fallback;
  }
}

type ContactRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_id: string | null;
  is_primary_phone: boolean | null;
  matched_phone: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type CompanyRow = {
  id: string;
  name: string | null;
  matched_phone: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function pickByTiebreaker<T extends { created_at?: string | null; updated_at?: string | null; is_primary_phone?: boolean | null; company_id?: string | null }>(
  list: T[],
  mode: 'newest' | 'oldest' | 'priority',
): T | null {
  if (!list.length) return null;
  if (mode === 'oldest') {
    return [...list].sort(
      (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime(),
    )[0];
  }
  if (mode === 'priority') {
    return [...list].sort((a, b) => {
      const ac = a.company_id ? 1 : 0;
      const bc = b.company_id ? 1 : 0;
      if (ac !== bc) return bc - ac;
      const ap = a.is_primary_phone ? 1 : 0;
      const bp = b.is_primary_phone ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime();
    })[0];
  }
  return [...list].sort(
    (a, b) =>
      new Date(b.updated_at ?? b.created_at ?? 0).getTime() -
      new Date(a.updated_at ?? a.created_at ?? 0).getTime(),
  )[0];
}

function buildContactCandidate(r: ContactRow): ResolutionCandidate {
  return {
    type: 'contact',
    id: r.id,
    name: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Без имени',
    first_name: r.first_name,
    last_name: r.last_name,
    company_id: r.company_id ?? null,
    is_primary_phone: r.is_primary_phone ?? null,
    matched_phone: r.matched_phone ?? null,
    created_at: r.created_at ?? null,
    updated_at: r.updated_at ?? null,
  };
}

function buildCompanyCandidate(r: CompanyRow): ResolutionCandidate {
  return {
    type: 'company',
    id: r.id,
    name: r.name ?? 'Без названия',
    company_id: null,
    matched_phone: r.matched_phone ?? null,
    created_at: r.created_at ?? null,
    updated_at: r.updated_at ?? null,
  };
}

export interface ResolvePhoneOptions {
  phone: string;
  contactId?: string | null;
  companyId?: string | null;
}

/**
 * Resolve contact/company by phone using the configured system strategy.
 * Returns null contactId/companyId + candidates list when manual choice is required.
 */
export async function resolvePhoneForScreenPop(
  opts: ResolvePhoneOptions,
): Promise<PhoneResolutionResult> {
  const cfg = await loadPhoneResolutionConfig();
  const strategy: ResolutionStrategy = cfg.strategy ?? 'legacy';

  let contactId: string | null = opts.contactId ?? null;
  let companyId: string | null = opts.companyId ?? null;
  let candidates: ResolutionCandidate[] | null = null;

  if (strategy === 'off') {
    return { contactId, companyId, candidates, effectiveStrategy: strategy };
  }

  const digits = (opts.phone || '').replace(/\D/g, '');
  const suffix9 = digits.slice(-9);
  const suffix7 = digits.slice(-7);

  console.log(
    `[phone-resolution] strategy=${strategy}, phone=${digits}, contactId=${contactId}, companyId=${companyId}`,
  );

  // Legacy: original RPC, single result, zero behavioural change.
  if (strategy === 'legacy') {
    if (!contactId && suffix9.length >= 7) {
      const { data } = await supabase.rpc('find_contact_by_phone_suffix', {
        phone_suffix: suffix9,
      });
      if (Array.isArray(data) && data.length) {
        contactId = data[0].id;
        if (data[0].company_id && !companyId) companyId = data[0].company_id;
      }
    }
    if (!companyId && suffix7.length === 7) {
      const { data } = await supabase.rpc('find_company_by_phone_suffix', {
        phone_suffix: suffix7,
      });
      if (Array.isArray(data) && data.length) companyId = data[0].id;
    }
    return { contactId, companyId, candidates, effectiveStrategy: strategy };
  }

  let contactList: ContactRow[] = [];
  let companyList: CompanyRow[] = [];

  if (!contactId && suffix9.length >= 7) {
    const { data, error } = await supabase.rpc('find_contacts_by_phone_suffix_v2', {
      phone_suffix: suffix9,
      p_limit: cfg.maxCandidates,
    });
    if (error) console.error('[phone-resolution] contacts_v2 error:', error);
    contactList = (data as ContactRow[] | null) ?? [];
  }
  if (!companyId && suffix7.length === 7) {
    const { data, error } = await supabase.rpc('find_companies_by_phone_suffix_v2', {
      phone_suffix: suffix7,
      p_limit: cfg.maxCandidates,
    });
    if (error) console.error('[phone-resolution] companies_v2 error:', error);
    companyList = (data as CompanyRow[] | null) ?? [];
  }

  if (strategy === 'manual') {
    const all: ResolutionCandidate[] = [
      ...contactList.map(buildContactCandidate),
      ...companyList.map(buildCompanyCandidate),
    ];
    if (all.length === 1) {
      const c = all[0];
      if (c.type === 'contact') {
        contactId = c.id;
        if (c.company_id && !companyId) companyId = c.company_id;
      } else if (c.type === 'company') {
        companyId = c.id;
      }
    } else if (all.length > 1) {
      candidates = all;
    }
    return { contactId, companyId, candidates, effectiveStrategy: strategy };
  }

  if (strategy === 'hybrid') {
    if (contactList.length === 1) {
      contactId = contactList[0].id;
      if (contactList[0].company_id && !companyId) companyId = contactList[0].company_id;
    } else if (contactList.length > 1) {
      // Auto-link the contact chosen by hybrid tiebreaker; keep the rest as alternatives.
      const picked = pickByTiebreaker(contactList, cfg.hybridTiebreaker);
      if (picked) {
        contactId = picked.id;
        if (picked.company_id && !companyId) companyId = picked.company_id;
        const alternatives = contactList.filter((c) => c.id !== picked.id);
        if (alternatives.length > 0) {
          candidates = alternatives.map(buildContactCandidate);
        }
      } else {
        candidates = contactList.map(buildContactCandidate);
      }
    }
    if (!companyId) {
      if (companyList.length === 1) {
        companyId = companyList[0].id;
      } else if (companyList.length > 1) {
        candidates = [...(candidates ?? []), ...companyList.map(buildCompanyCandidate)];
      }
    }
    return { contactId, companyId, candidates, effectiveStrategy: strategy };
  }

  // newest | oldest | priority
  const tb = strategy as 'newest' | 'oldest' | 'priority';
  if (!contactId) {
    const picked = pickByTiebreaker(contactList, tb);
    if (picked) {
      contactId = picked.id;
      if (picked.company_id && !companyId) companyId = picked.company_id;
    }
  }
  if (!companyId) {
    const picked = pickByTiebreaker(companyList, tb);
    if (picked) companyId = picked.id;
  }

  return { contactId, companyId, candidates, effectiveStrategy: strategy };
}
