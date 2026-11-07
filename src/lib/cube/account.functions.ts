import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { deletionConfirmation } from "./account";

export const deleteOwnAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { confirmation: string }) => ({ confirmation: deletionConfirmation(input?.confirmation) }))
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.auth.getUser();
    if (error || !data.user || data.user.id !== context.userId) throw new Error("Please sign in again before deleting your account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (deleteError) throw new Error("Account could not be deleted. Please try again later.");
    return { deleted: true };
  });