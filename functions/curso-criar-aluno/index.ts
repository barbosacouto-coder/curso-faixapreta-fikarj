// Etapa 2 (v2) — Curso de Formação de Faixas Pretas FIKARJ
// Edge Function: cadastro AVULSO de 1 aluno (fora da base de atletas),
// usando CPF + data de nascimento — sem e-mail. Só o admin pode chamar.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function soDigitos(v: string): string {
  return (v || "").replace(/\D/g, "");
}

function emailSinteticoPara(cpfDigitos: string): string {
  return `${cpfDigitos}@aluno.cursofikarj.app`;
}

function gerarSenhaInterna(): string {
  const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let senha = "";
  for (let i = 0; i < 24; i++) {
    senha += caracteres[Math.floor(Math.random() * caracteres.length)];
  }
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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ erro: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ erro: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: perfil, error: perfilErr } = await adminClient
      .from("curso_perfis").select("role, ativo").eq("id", userData.user.id).single();
    if (perfilErr || !perfil || perfil.role !== "admin" || !perfil.ativo) {
      return new Response(JSON.stringify({ erro: "Apenas o administrador pode criar contas de aluno" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    const nome_completo = body?.nome_completo?.trim();
    const cpf = soDigitos(body?.cpf ?? "");
    const nascimento = body?.nascimento; // formato YYYY-MM-DD
    const faixa = body?.faixa ?? null;
    const associacao = body?.associacao ?? null;
    const registro_fikarj = body?.registro_fikarj ?? null;
    const cnkb = body?.cnkb ?? null;

    if (!nome_completo || cpf.length !== 11 || !nascimento) {
      return new Response(
        JSON.stringify({ erro: "Nome completo, CPF (11 dígitos) e data de nascimento são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: existente } = await adminClient.from("curso_perfis").select("id").eq("cpf", cpf).maybeSingle();
    if (existente) {
      return new Response(JSON.stringify({ erro: "Já existe um aluno cadastrado com esse CPF" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = emailSinteticoPara(cpf);
    const { data: novoUsuario, error: criarErr } = await adminClient.auth.admin.createUser({
      email, password: gerarSenhaInterna(), email_confirm: true,
    });
    if (criarErr || !novoUsuario?.user) {
      return new Response(JSON.stringify({ erro: criarErr?.message ?? "Erro ao criar usuário" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insertErr } = await adminClient.from("curso_perfis").insert({
      id: novoUsuario.user.id, nome_completo, email, cpf, nascimento,
      faixa, associacao, registro_fikarj, cnkb, role: "aluno", ativo: true,
    });
    if (insertErr) {
      await adminClient.auth.admin.deleteUser(novoUsuario.user.id);
      return new Response(JSON.stringify({ erro: insertErr.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ sucesso: true, aluno_id: novoUsuario.user.id, nome_completo, cpf }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ erro: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
