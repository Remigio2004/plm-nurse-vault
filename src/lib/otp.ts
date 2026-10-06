import { supabase } from "@/integrations/supabase/client";

export async function checkVerified(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_session_verified" as never);
  return !error && (data as unknown) === true;
}
