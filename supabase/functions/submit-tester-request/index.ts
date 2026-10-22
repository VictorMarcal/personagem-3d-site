// Grava um pedido de acesso à beta (app_testers) só depois de confirmar o
// token do Cloudflare Turnstile junto da própria Cloudflare (2026-10-22,
// a pedido - pedidos com emails de padrão suspeito tipo
// "uq.o.hah.i.h.e.jo45@gmail.com", a 3ª camada anti-spam depois do
// campo-isco e do tempo mínimo em js/auth.js). O TURNSTILE_SECRET_KEY
// nunca pode viver no código do site (JS do browser) - só aqui, como
// secret desta função (supabase secrets set TURNSTILE_SECRET_KEY=...).
//
// A policy "app_testers_insert_anyone" (insert direto pelo anon key) foi
// removida do lado da base de dados depois disto existir - esta função,
// com a service role key, é agora o ÚNICO caminho para gravar um pedido.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TURNSTILE_SECRET_KEY = Deno.env.get("TURNSTILE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let email: string, turnstileToken: string;
  try {
    const body = await req.json();
    email = typeof body.email === "string" ? body.email.trim() : "";
    turnstileToken = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
  } catch {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  if (!email || !turnstileToken) {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  // Verificação server-side junto da Cloudflare - a única forma de
  // confirmar o token sem expor o secret ao browser.
  const verifyResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret: TURNSTILE_SECRET_KEY, response: turnstileToken }),
  });
  const verifyResult = await verifyResponse.json();

  if (!verifyResult.success) {
    return jsonResponse({ error: "turnstile_failed" }, 403);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase.from("app_testers").insert({ email });

  if (error) {
    if (error.code === "23505") return jsonResponse({ error: "duplicate" }, 409);
    return jsonResponse({ error: "insert_failed" }, 500);
  }

  return jsonResponse({ success: true }, 200);
});
