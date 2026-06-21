import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

export async function handler(req: Request): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { login } = await req.json();

    if (!login) {
      console.error('Login is required');
      return errorResponse('Login is required', 400);
    }

    console.log('Authenticating softphone for login:', login);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: settings, error: settingsError } = await supabase
      .from('softphone_settings')
      .select('ocp_domain, ocp_proxy_api_key, ocp_proxy_url')
      .maybeSingle();

    if (settingsError || !settings) {
      console.error('Failed to get softphone settings:', settingsError);
      return errorResponse('Softphone settings not found', 500);
    }

    const { ocp_proxy_api_key, ocp_proxy_url } = settings;

    if (!ocp_proxy_api_key) {
      console.error('OCP API key not configured');
      return errorResponse('OCP API key not configured in settings', 500);
    }

    if (!ocp_proxy_url) {
      console.error('OCP proxy URL not configured');
      return errorResponse('OCP proxy URL not configured in settings', 500);
    }

    // Remove trailing slash if present
    const proxyBaseUrl = ocp_proxy_url.replace(/\/+$/, '');
    
    console.log('Requesting token from proxy server:', proxyBaseUrl);

    const response = await fetch(
      `${proxyBaseUrl}/proxy/authenticate?login=${encodeURIComponent(login)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Proxy-Api-Key': ocp_proxy_api_key,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Proxy authentication failed:', response.status, errorText);
      return errorResponse(`OCP authentication failed: ${errorText}`, response.status);
    }

    const data = await response.json();
    console.log('Successfully received token from proxy');

    return jsonResponse({ softphone_auth_token: data.softphone_auth_token });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Softphone authentication error:', error);
    return errorResponse(`Authentication failed: ${errorMessage}`, 500);
  }
}

Deno.serve(handler);
