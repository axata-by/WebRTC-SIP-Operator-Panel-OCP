import { supabase } from '@/integrations/supabase/client';
import { mapConfigFromDb } from '@/components/calls/screen-pop/context/mapConfigFromDb';
import { LOG_PREFIX } from './types';

/**
 * Load screen pop config for call type and queue
 * 
 * Priority:
 * 1. Queue-specific config (if queue provided)
 * 2. Default config (empty/null queue_names)
 * 3. Any matching config for the call type
 */
export async function loadConfigForCall(callType: number, queue: string | null) {
  console.log(`${LOG_PREFIX} Loading config for call_type:`, callType, 'queue:', queue);
  
  // 1. First, try to find a config for this specific queue
  if (queue) {
    const { data: queueConfigs, error: queueError } = await supabase
      .from('call_screen_pop_configs')
      .select('*')
      .eq('is_active', true)
      .contains('call_directions', [callType])
      .contains('queue_names', [queue])
      .order('is_default', { ascending: false })
      .limit(1);

    if (queueError) {
      console.error(`${LOG_PREFIX} Error loading queue config:`, queueError);
    } else if (queueConfigs && queueConfigs.length > 0) {
      const config = mapConfigFromDb(queueConfigs[0]);
      console.log(`${LOG_PREFIX} Found queue-specific config:`, { 
        id: config.id, 
        name: config.name,
        queue_names: config.queue_names,
      });
      return config;
    }
  }

  // 2. Fall back to default config (empty queue_names or null)
  const { data: defaultConfigs, error: defaultError } = await supabase
    .from('call_screen_pop_configs')
    .select('*')
    .eq('is_active', true)
    .contains('call_directions', [callType])
    .order('is_default', { ascending: false })
    .limit(10); // Get multiple to filter

  if (defaultError) {
    console.error(`${LOG_PREFIX} Error loading default config:`, defaultError);
    return null;
  }

  // Filter to find configs with empty or null queue_names
  const defaultConfig = defaultConfigs?.find(c => {
    const queueNames = (c as any).queue_names as string[] | null;
    return !queueNames || queueNames.length === 0;
  });

  if (defaultConfig) {
    const config = mapConfigFromDb(defaultConfig);
    console.log(`${LOG_PREFIX} Using default config (no queue restriction):`, { 
      id: config.id, 
      name: config.name,
    });
    return config;
  }

  // 3. If no default config, use any matching config
  if (defaultConfigs && defaultConfigs.length > 0) {
    const config = mapConfigFromDb(defaultConfigs[0]);
    console.log(`${LOG_PREFIX} Using first available config:`, { 
      id: config.id, 
      name: config.name,
    });
    return config;
  }

  console.log(`${LOG_PREFIX} No screen pop config found for call_type:`, callType);
  return null;
}
