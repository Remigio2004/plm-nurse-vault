import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { checkVerified } from "@/lib/otp";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/" });
    if (!(await checkVerified())) throw redirect({ to: "/" });
    return { user: data.user };
  },
  component: () => <Outlet />,
});
