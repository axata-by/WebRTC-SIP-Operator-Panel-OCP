import { supabase } from "@/integrations/supabase/client";
import { LOG_PREFIX } from "./types";

export interface FinishCallParams {
  externalCallId?: string;
  callId?: string;
  answered?: boolean;
}

export interface FinishCallResult {
  success: boolean;
  callId?: string;
  reason?: string;
  statusCode?: string;
}

/**
 * Finish call from softphone event
 * 
 * Вызывается при получении события callEnded от софтфона.
 * Обновляет статус звонка в БД (если он ещё active).
 * 
 * Работает в связке с telephony-call-finish:
 * - Если софтфон первый — ставит status='finished'
 * - Если АТС уже завершила — пропускает обновление
 * - АТС может потом обогатить данные (duration, record_url, etc)
 */
export async function finishCallFromSoftphone(
  params: FinishCallParams
): Promise<FinishCallResult> {
  const { externalCallId, callId } = params;

  if (!externalCallId && !callId) {
    console.warn(`${LOG_PREFIX} finishCallFromSoftphone: no identifier provided`);
    return { success: false, reason: "no_identifier" };
  }

  console.log(`${LOG_PREFIX} Finishing call from softphone:`, { externalCallId, callId });

  try {
    const { data, error } = await supabase.functions.invoke("softphone-call-finish", {
      body: {
        external_call_id: externalCallId,
        call_id: callId,
        answered: params.answered,
      },
    });

    if (error) {
      console.error(`${LOG_PREFIX} Error calling softphone-call-finish:`, error);
      return { success: false, reason: "api_error" };
    }

    console.log(`${LOG_PREFIX} Call finish result:`, data);

    return {
      success: data?.success ?? false,
      callId: data?.call_id,
      reason: data?.reason,
      statusCode: data?.status_code,
    };
  } catch (err) {
    console.error(`${LOG_PREFIX} Exception in finishCallFromSoftphone:`, err);
    return { success: false, reason: "exception" };
  }
}
