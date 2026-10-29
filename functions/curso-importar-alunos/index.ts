// Etapa 2 (v2) — Curso de Formação de Faixas Pretas FIKARJ
// Edge Function: importa em massa, da tabela `atletas` (Portal FIKARJ),
// todos os atletas elegíveis para o curso (marrom 1º Kyu e faixas pretas).
// Só o admin pode chamar. Não altera a tabela `atletas` — só lê.

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
      return new Response(JSON.stringify({ erro: "Apenas o administrador pode importar alunos" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Critério de elegibilidade combinado com o usuário em 28/10/2026:
    // marrom 1º Kyu (inclusive variações "pontas preta") e qualquer faixa preta (Dan).
    const { data: elegiveis, error: atletasErr } = await adminClient
      .from("atletas")
      .select("registro, nome, cpf, nascimento, graduacao, associacao, cnkb")
      .or("graduacao.ilike.MARROM 1º KYU%,graduacao.ilike.PRETA %");

    if (atletasErr) {
      return new Response(JSON.stringify({ erro: "Erro ao ler base de atletas: " + atletasErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resultado = { importados: [] as string[], ja_existiam: [] as string[], erros: [] as string[] };

    for (const atleta of elegiveis ?? []) {
      const cpf = soDigitos(atleta.cpf ?? "");
      if (cpf.length !== 11 || !atleta.nascimento || !atleta.nome) {
        resultado.erros.push(`${atleta.nome ?? "(sem nome)"} — dados incompletos (CPF/nascimento)`);
        continue;
      }

      const { data: jaExiste } = await adminClient.from("curso_perfis").select("id").eq("cpf", cpf).maybeSingle();
      if (jaExiste) {
        resultado.ja_existiam.push(atleta.nome);
        continue;
      }

      const email = emailSinteticoPara(cpf);
      const { data: novoUsuario, error: criarErr } = await adminClient.auth.admin.createUser({
        email, password: gerarSenhaInterna(), email_confirm: true,
      });
      if (criarErr || !novoUsuario?.user) {
        resultado.erros.push(`${atleta.nome} — ${criarErr?.message ?? "erro ao criar usuário"}`);
        continue;
      }

      const { error: insertErr } = await adminClient.from("curso_perfis").insert({
        id: novoUsuario.user.id,
        nome_completo: atleta.nome,
        email,
        cpf,
        nascimento: atleta.nascimento,
        faixa: atleta.graduacao,
        associacao: atleta.associacao,
        registro_fikarj: atleta.registro,
        cnkb: atleta.cnkb,
        role: "aluno",
        ativo: true,
      });

      if (insertErr) {
        await adminClient.auth.admin.deleteUser(novoUsuario.user.id);
        resultado.erros.push(`${atleta.nome} — ${insertErr.message}`);
        continue;
      }

      resultado.importados.push(atleta.nome);
    }

    return new Response(JSON.stringify({ sucesso: true, ...resultado, total_elegiveis: (elegiveis ?? []).length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ erro: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
