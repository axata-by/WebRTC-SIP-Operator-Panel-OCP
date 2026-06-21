import { LOG_PREFIX } from './types';

/**
 * Check if a Supabase error is retriable (transient infrastructure issue)
 */
function isRetriableError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  
  const msg = error.message?.toLowerCase() || '';
  const code = error.code || '';
  
  // Connection timeout / upstream errors (503)
  if (msg.includes('connection timeout') || msg.includes('upstream connect error')) return true;
  
  // PostgREST schema cache error
  if (code === 'PGRST002') return true;
  
  // Generic "Could not query" errors
  if (msg.includes('could not query the database')) return true;
  
  return false;
}

/**
 * Retry a Supabase SDK call that returns { data, error } with exponential backoff.
 * Only retries on transient 503 / connection timeout errors.
 */
export async function retrySupabaseCall<T>(
  fn: () => PromiseLike<{ data: T; error: any }>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<{ data: T; error: any }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await fn();
    
    if (!result.error || !isRetriableError(result.error)) {
      return result;
    }
    
    if (attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`${LOG_PREFIX} Retriable error (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`, 
        result.error.code || result.error.message?.substring(0, 80));
      await new Promise(r => setTimeout(r, delay));
    } else {
      console.warn(`${LOG_PREFIX} All ${maxRetries} retries exhausted, returning last error`);
      return result;
    }
  }
  
  // Unreachable
  return await fn();
}
