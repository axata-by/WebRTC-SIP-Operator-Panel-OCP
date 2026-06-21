import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { SoftphoneSettings } from '@/lib/softphone';

const QUERY_KEY = ['softphone-settings'];

export function useSoftphoneSettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading, isFetched } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_softphone_settings');

      if (error) {
        console.error('[useSoftphoneSettings] RPC error:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        return null;
      }

      return data[0] as SoftphoneSettings;
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
    refetchOnWindowFocus: false,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Omit<SoftphoneSettings, 'id' | 'created_at' | 'updated_at'>>) => {
      if (!settings?.id) {
        throw new Error('No settings ID available');
      }

      // Filter out undefined values and prevent writing empty strings for API key
      const cleanedUpdates = { ...updates };
      
      // If API key is empty string, set to null (or skip if trying to clear)
      if ('ocp_proxy_api_key' in cleanedUpdates) {
        if (cleanedUpdates.ocp_proxy_api_key === '') {
          cleanedUpdates.ocp_proxy_api_key = null;
        }
      }

      // Remove undefined values
      Object.keys(cleanedUpdates).forEach(key => {
        if (cleanedUpdates[key as keyof typeof cleanedUpdates] === undefined) {
          delete cleanedUpdates[key as keyof typeof cleanedUpdates];
        }
      });

      if (Object.keys(cleanedUpdates).length === 0) {
        return settings;
      }

      const { data, error } = await supabase
        .from('softphone_settings')
        .update(cleanedUpdates)
        .eq('id', settings.id)
        .select()
        .single();

      if (error) {
        console.error('[useSoftphoneSettings] Update error:', error);
        throw error;
      }

      return data;
    },
    // Optimistic update for instant UI feedback
    onMutate: async (updates) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });

      // Snapshot the previous value
      const previousSettings = queryClient.getQueryData<SoftphoneSettings>(QUERY_KEY);

      // Optimistically update to the new value
      if (previousSettings) {
        queryClient.setQueryData<SoftphoneSettings>(QUERY_KEY, {
          ...previousSettings,
          ...updates,
        });
      }

      return { previousSettings };
    },
    onError: (error, updates, context) => {
      // Rollback to previous value on error
      if (context?.previousSettings) {
        queryClient.setQueryData(QUERY_KEY, context.previousSettings);
      }
      console.error('[useSoftphoneSettings] Mutation error:', error);
      toast.error('Ошибка сохранения настроек');
    },
    onSuccess: () => {
      toast.success('Настройки сохранены');
    },
    onSettled: () => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  return {
    settings,
    isLoading,
    isFetched, // Important: lets UI know data has been fetched at least once
    updateSettings: updateMutation.mutate,
    updateSettingsAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
  };
}
