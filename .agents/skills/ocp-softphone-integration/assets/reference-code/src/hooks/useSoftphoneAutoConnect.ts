import { useEffect, useRef } from 'react';
import { useSoftphoneSettings } from './useSoftphoneSettings';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UseSoftphoneAutoConnectProps {
  onAuthenticated?: () => void;
  enabled?: boolean;
}

export function useSoftphoneAutoConnect({ 
  onAuthenticated, 
  enabled = true 
}: UseSoftphoneAutoConnectProps = {}) {
  const { settings } = useSoftphoneSettings();
  const { user } = useAuth();
  const hasAttempted = useRef(false);

  useEffect(() => {
    // Reset attempt flag when user changes
    if (!user) {
      hasAttempted.current = false;
      return;
    }

    if (!enabled) return;
    if (!settings?.auto_connect) return;
    if (hasAttempted.current) return;

    const authenticateSoftphone = async () => {
      try {
        // Get user profile to get telephony_login
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('telephony_login')
          .eq('id', user.id)
          .single();

        if (profileError || !profile?.telephony_login) {
          console.log('No telephony_login configured for user');
          return;
        }

        hasAttempted.current = true;

        // Call edge function to get auth token
        const { data, error } = await supabase.functions.invoke('softphone-authenticate', {
          body: { login: profile.telephony_login }
        });

        if (error) {
          throw error;
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        if (!data?.softphone_auth_token) {
          throw new Error('No auth token received');
        }

        // Dispatch authentication event to softphone widget
        window.dispatchEvent(
          new CustomEvent('authenticateOCPModule', {
            detail: {
              ocpDomain: settings.ocp_domain,
              ocpAuthToken: data.softphone_auth_token,
            },
          })
        );

        // Show softphone container and wrapper
        const container = document.getElementById('soft-phone-container');
        if (container) {
          container.style.display = 'block';
        }
        const wrapper = document.getElementById('soft-phone-wrapper');
        if (wrapper) {
          wrapper.style.display = 'block';
          wrapper.style.zIndex = '9999';
        }

        console.log('Softphone authenticated successfully');
        onAuthenticated?.();
      } catch (error: any) {
        console.error('Softphone auto-connect failed:', error);
        const detail = error?.message || error?.error || 'Неизвестная ошибка';
        toast.error('Автоподключение софтфона не удалось', {
          description: detail,
          duration: 8000,
        });
      }
    };

    authenticateSoftphone();
  }, [settings, user, enabled, onAuthenticated]);
}
