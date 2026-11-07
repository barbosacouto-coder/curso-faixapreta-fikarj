-- Avaliações feitas dentro do próprio site (correção no servidor)
-- Aplicado no projeto Supabase jhvbpssigakvhjfjqazc (migração "curso_avaliacao_no_site").
-- O gabarito fica só no banco: o aluno recebe as questões sem a resposta certa,
-- envia as escolhas e o servidor corrige e lança a nota pela mesma regra do Google Forms
-- (só as 2 primeiras tentativas contam; vale a maior nota).

alter table public.curso_avaliacoes add column if not exists no_site boolean not null default false;

create table if not exists public.curso_questoes (
  id uuid primary key default gen_random_uuid(),
  avaliacao_id uuid not null references public.curso_avaliacoes(id) on delete cascade,
  ordem int not null,
  enunciado text not null,
  opcoes jsonb not null,          -- lista de textos, ex.: ["A","B","C","D"]
  correta int not null,           -- índice (0 = primeira opção)
  unique (avaliacao_id, ordem)
);
alter table public.curso_questoes enable row level security;
-- só o admin lê a tabela diretamente (o aluno usa a função abaixo, que esconde o gabarito)
create policy curso_questoes_admin on public.curso_questoes for all
  using (public.curso_is_admin()) with check (public.curso_is_admin());

-- Questões para o aluno, SEM o gabarito
create or replace function public.curso_questoes_da_avaliacao(p_avaliacao uuid)
returns table(ordem int, enunciado text, opcoes jsonb)
language plpgsql security definer set search_path = public stable as $$
begin
  if not exists (select 1 from curso_perfis p where p.id = auth.uid() and p.ativo) then
    raise exception 'acesso negado';
  end if;
  if not exists (select 1 from curso_avaliacoes a where a.id = p_avaliacao and a.publicado and a.no_site) then
    raise exception 'avaliação indisponível';
  end if;
  return query select q.ordem, q.enunciado, q.opcoes from curso_questoes q
    where q.avaliacao_id = p_avaliacao order by q.ordem;
end $$;

-- Recebe as respostas, corrige no servidor e lança a tentativa
create or replace function public.curso_enviar_avaliacao(p_avaliacao uuid, p_respostas int[])
returns table(acertos int, total int, numero int, nota numeric, contada boolean, nota_vigente numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_total int; v_acertos int; r record;
begin
  if not exists (select 1 from curso_perfis p where p.id = v_uid and p.ativo) then
    raise exception 'acesso negado';
  end if;
  if not exists (select 1 from curso_avaliacoes a where a.id = p_avaliacao and a.publicado and a.no_site) then
    raise exception 'avaliação indisponível';
  end if;
  select count(*) into v_total from curso_questoes q where q.avaliacao_id = p_avaliacao;
  if p_respostas is null or coalesce(array_length(p_respostas, 1), 0) <> v_total then
    raise exception 'responda todas as % questões', v_total;
  end if;
  select count(*) into v_acertos from curso_questoes q
    where q.avaliacao_id = p_avaliacao and p_respostas[q.ordem] = q.correta;
  select * into r from curso_registrar_tentativa(p_avaliacao, v_uid, v_acertos, null);
  return query select v_acertos, v_total, r.numero, r.nota, r.contada, r.nota_vigente;
end $$;

revoke all on function public.curso_questoes_da_avaliacao(uuid) from public, anon;
revoke all on function public.curso_enviar_avaliacao(uuid, int[]) from public, anon;
grant execute on function public.curso_questoes_da_avaliacao(uuid) to authenticated;
grant execute on function public.curso_enviar_avaliacao(uuid, int[]) to authenticated;
