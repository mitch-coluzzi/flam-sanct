import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const { user_id } = await req.json();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", user_id)
    .single();

  return new Response(
    JSON.stringify({ app_role: data?.role ?? "member" }),
    { headers: { "Content-Type": "application/json" } },
  );
});
