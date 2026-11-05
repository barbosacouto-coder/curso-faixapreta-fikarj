// Notas automáticas — Curso de Formação de Faixas Pretas FIKARJ
// Edge Function chamada pelo script do Google Forms a cada resposta enviada.
// verify_jwt=false: quem protege é o segredo compartilhado (tabela curso_config).
// Regras: acha o aluno pelo CPF e confere o nome; converte os pontos em nota;
// só as 2 primeiras tentativas contam e vale a MAIOR nota. Resposta que não
// bate com nenhum aluno vai para curso_respostas_pendentes, para o admin revisar.

import { createClient } from "npm:@supabase/supabase-js@2";

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

const IGNORAR = new Set(["de", "da", "do", "das", "dos", "e"]);
function tokens(nome: unknown): string[] {
  return String(nome ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z\s]/g, " ")
    .split(/\s+/).filter((t) => t.length > 1 && !IGNORAR.has(t));
}
// Todas as palavras do nome informado precisam existir no nome cadastrado (mín. 2).
function nomeConfere(informado: unknown, cadastrado: unknown): boolean {
  const a = tokens(informado);
  const b = new Set(tokens(cadastrado));
  return a.length >= 2 && a.every((t) => b.has(t));
}

function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);

  const body = await req.json().catch(() => null);
  if (!body) return json({ erro: "Corpo inválido" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: cfg } = await admin.from("curso_config").select("valor").eq("chave", "forms_segredo").maybeSingle();
  if (!cfg || typeof body.segredo !== "string" || !igual(body.segredo, cfg.valor)) {
    return json({ erro: "Não autorizado" }, 401);
  }

  const avaliacaoId = String(body.avaliacao_id ?? "");
  const pontos = Number(body.pontos);
  const responseId = body.response_id ? String(body.response_id) : null;
  const cpf = soDigitos(body.cpf);
  if (!avaliacaoId || !Number.isFinite(pontos) || pontos < 0) return json({ erro: "Dados inválidos" }, 400);

  const pendente = async (motivo: string) => {
    await admin.from("curso_respostas_pendentes").upsert({
      avaliacao_id: avaliacaoId, cpf_informado: cpf || String(body.cpf ?? ""), nome_informado: body.nome ?? null,
      associacao_informada: body.associacao ?? null, pontos, motivo, form_response_id: responseId,
    }, { onConflict: "form_response_id", ignoreDuplicates: true });
    return json({ ok: true, lancada: false, pendente: true, motivo });
  };

  if (cpf.length !== 11) return await pendente("CPF inválido");

  const { data: perfil } = await admin.from("curso_perfis")
    .select("id, nome_completo, ativo, role").eq("cpf", cpf).eq("role", "aluno").maybeSingle();
  if (!perfil) return await pendente("CPF não encontrado entre os alunos");
  if (!perfil.ativo) return await pendente("Aluno inativo");
  if (!nomeConfere(body.nome, perfil.nome_completo)) return await pendente("Nome não confere com o CPF");

  const { data, error } = await admin.rpc("curso_registrar_tentativa", {
    p_avaliacao: avaliacaoId, p_aluno: perfil.id, p_pontos: pontos, p_response_id: responseId,
  });
  if (error) return json({ erro: error.message }, 500);

  const r = Array.isArray(data) ? data[0] : data;
  return json({
    ok: true, lancada: !!r?.contada, tentativa: r?.numero, nota_desta_tentativa: r?.nota,
    nota_vigente: r?.nota_vigente, duplicada: !!r?.duplicada,
  });
});
