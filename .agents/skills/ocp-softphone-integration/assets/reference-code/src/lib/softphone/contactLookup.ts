import { supabase } from '@/integrations/supabase/client';
import { LOG_PREFIX, type ContactLookupResult } from './types';
import { retrySupabaseCall } from './retry';

// ============= Error Types =============

export interface ContactLookupError {
  type: 'rpc_error';
  message: string;
  code?: string;
  hint?: string;
  details?: string;
}

export type ContactLookupResult_WithError = ContactLookupResult | null | { _lookupError: ContactLookupError };
export type ProspectLookupResult_WithError = ProspectLookupResult | null | { _lookupError: ContactLookupError };

export function isLookupError(result: unknown): result is { _lookupError: ContactLookupError } {
  return !!result && typeof result === 'object' && '_lookupError' in (result as object);
}

export interface ProspectLookupResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  sandbox_id: string | null;
}

/**
 * Search for contact by phone number using the last 7 digits
 * Uses optimized DB function find_contact_by_phone_suffix
 */
export async function findContactByPhone(phone: string): Promise<ContactLookupResult_WithError> {
  if (!phone) {
    console.log(`${LOG_PREFIX} No phone provided for contact search`);
    return null;
  }

  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length < 9) {
    console.log(`${LOG_PREFIX} Phone too short for search:`, cleanPhone);
    return null;
  }
  
  const last9Digits = cleanPhone.slice(-9);
  console.log(`${LOG_PREFIX} Searching contact by last 9 digits:`, last9Digits);

  try {
    const { data, error } = await retrySupabaseCall(() =>
      supabase.rpc('find_contact_by_phone_suffix', { phone_suffix: last9Digits })
    );

    if (error) {
      console.error(`${LOG_PREFIX} Error searching contacts:`, error);
      return {
        _lookupError: {
          type: 'rpc_error',
          message: error.message,
          code: error.code,
          hint: error.hint,
          details: error.details,
        },
      };
    }

    if (data && Array.isArray(data) && data.length > 0) {
      const contact = data[0];
      console.log(`${LOG_PREFIX} Found contact:`, { 
        id: contact.id, 
        name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
        company_id: contact.company_id 
      });
      return {
        id: contact.id,
        first_name: contact.first_name,
        last_name: contact.last_name,
        company_id: contact.company_id,
      };
    }

    console.log(`${LOG_PREFIX} No contact found for phone:`, phone);
    return null;
  } catch (error) {
    console.error(`${LOG_PREFIX} Exception searching contacts:`, error);
    return null;
  }
}

/**
 * Search for prospect by phone number using the last 7 digits
 */
export async function findProspectByPhone(phone: string): Promise<ProspectLookupResult_WithError> {
  if (!phone) {
    console.log(`${LOG_PREFIX} No phone provided for prospect search`);
    return null;
  }

  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length < 7) {
    console.log(`${LOG_PREFIX} Phone too short for prospect search:`, cleanPhone);
    return null;
  }
  
  const last7Digits = cleanPhone.slice(-7);
  console.log(`${LOG_PREFIX} Searching prospect by last 7 digits:`, last7Digits);

  try {
    const { data, error } = await retrySupabaseCall(() =>
      supabase.rpc('find_prospect_by_phone_suffix', { phone_suffix: last7Digits })
    );

    if (error) {
      console.error(`${LOG_PREFIX} Error searching prospects:`, error);
      return {
        _lookupError: {
          type: 'rpc_error',
          message: error.message,
          code: error.code,
          hint: error.hint,
          details: error.details,
        },
      };
    }

    if (data && Array.isArray(data) && data.length > 0) {
      const prospect = data[0];
      console.log(`${LOG_PREFIX} Found prospect:`, { 
        id: prospect.id, 
        name: `${prospect.first_name || ''} ${prospect.last_name || ''}`.trim(),
        company_name: prospect.company_name 
      });
      return {
        id: prospect.id,
        first_name: prospect.first_name,
        last_name: prospect.last_name,
        company_name: prospect.company_name,
        sandbox_id: prospect.sandbox_id,
      };
    }

    console.log(`${LOG_PREFIX} No prospect found for phone:`, phone);
    return null;
  } catch (error) {
    console.error(`${LOG_PREFIX} Exception searching prospects:`, error);
    return null;
  }
}

/**
 * Find user by operator extension (telephony_login or phone_inner)
 */
export async function findUserByOperatorExt(operatorExt: string): Promise<string | null> {
  if (!operatorExt) return null;
  
  console.log(`${LOG_PREFIX} Looking up user by operator_ext:`, operatorExt);
  
  const { data, error } = await retrySupabaseCall(() =>
    supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .or(`telephony_login.eq.${operatorExt},phone_inner.eq.${operatorExt}`)
      .limit(1)
      .maybeSingle()
  );
  
  if (error) {
    console.error(`${LOG_PREFIX} Error finding user by operator_ext:`, error);
    return null;
  }
  
  if (data) {
    console.log(`${LOG_PREFIX} Found user by operator_ext:`, { 
      id: data.id, 
      name: `${data.first_name || ''} ${data.last_name || ''}`.trim() 
    });
  } else {
    console.log(`${LOG_PREFIX} No user found for operator_ext:`, operatorExt);
  }
  
  return data?.id || null;
}
