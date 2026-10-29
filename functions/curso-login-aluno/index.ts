// Etapa 2 (v2) — Curso de Formação de Faixas Pretas FIKARJ
// Edge Function PÚBLICA (verify_jwt=false): login do aluno por CPF + data de
// nascimento, igual ao Portal FIKARJ. Por baixo dos panos gera uma sessão
// real do Supabase Auth (o aluno nunca vê e-mail/senha).
// Tem limite de tentativas por CPF, igual ao padrão já usado no projeto.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function soDigitos(v: string): string {
  return (v || "").replace(/\D/g, "");
}
function gerarSenhaInterna(): string {
  const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let senha = "";
  for (let i = 0; i < 24; i++) senha += caracteres[Math.floor(Math.random() * caracteres.length)];
  return senha;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ erro: "Método não permitido" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => null);
    const cpf = soDigitos(body?.cpf ?? "");
    const nascimento = body?.nascimento; // YYYY-MM-DD

    if (cpf.length !== 11 || !nascimento) {
      return new Response(JSON.stringify({ erro: "Informe CPF e data de nascimento válidos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // limite: 5 tentativas em 15 minutos por CPF
    const quinzeMinAtras = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: tentativas } = await adminClient
      .from("curso_login_tentativas")
      .select("*", { count: "exact", head: true })
      .eq("cpf", cpf)
      .gte("em", quinzeMinAtras);

    if ((tentativas ?? 0) >= 5) {
      return new Response(JSON.stringify({ erro: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: perfil, error: perfilErr } = await adminClient
      .from("curso_perfis")
      .select("id, nome_completo, ativo")
      .eq("cpf", cpf)
      .eq("nascimento", nascimento)
      .maybeSingle();

    if (perfilErr || !perfil || !perfil.ativo) {
      await adminClient.from("curso_login_tentativas").insert({ cpf });
      return new Response(JSON.stringify({ erro: "CPF ou data de nascimento não encontrados, ou cadastro inativo" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // login correto: limpa tentativas antigas desse CPF
    await adminClient.from("curso_login_tentativas").delete().eq("cpf", cpf);

    // gera uma senha nova e descartável só para mintar a sessão deste login
    const senhaDescartavel = gerarSenhaInterna();
    const { error: updErr } = await adminClient.auth.admin.updateUserById(perfil.id, { password: senhaDescartavel });
    if (updErr) {
      return new Response(JSON.stringify({ erro: "Erro ao autenticar: " + updErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: authData, error: authErr } = await adminClient.auth.admin.getUserById(perfil.id);
    if (authErr || !authData?.user?.email) {
      return new Response(JSON.stringify({ erro: "Erro ao localizar conta do aluno" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: sessaoData, error: sessaoErr } = await adminClient.auth.signInWithPassword({
      email: authData.user.email,
      password: senhaDescartavel,
    });
    if (sessaoErr || !sessaoData?.session) {
      return new Response(JSON.stringify({ erro: "Erro ao criar sessão: " + (sessaoErr?.message ?? "") }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        sucesso: true,
        nome_completo: perfil.nome_completo,
        access_token: sessaoData.session.access_token,
        refresh_token: sessaoData.session.refresh_token,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ erro: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
