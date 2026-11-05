-- Notas automáticas a partir do Google Forms (curso FIKARJ)
-- Já aplicado no projeto Supabase jhvbpssigakvhjfjqazc (migração "curso_notas_automaticas").
-- Guardado aqui só como registro. O segredo compartilhado é gerado aleatoriamente
-- na tabela curso_config e NÃO fica neste arquivo.

alter table public.curso_avaliacoes add column if not exists pontos_totais numeric;

-- pontos totais de cada formulário (usados para converter pontos em nota de 0 a 10)
update public.curso_avaliacoes set pontos_totais = 25 where titulo like 'Avaliação de Primeiros Socorros%';
update public.curso_avaliacoes set pontos_totais = 20 where titulo = 'Simulado FIKARJ — História do Karatê';
update public.curso_avaliacoes set pontos_totais = 10 where titulo like 'Simulado Teórico FIKARJ%';
update public.curso_avaliacoes set pontos_totais = 10 where titulo like 'Simulado FIKARJ — Arbitragem%';

create table if not exists public.curso_tentativas (
  id uuid primary key default gen_random_uuid(),
  avaliacao_id uuid not null references public.curso_avaliacoes(id) on delete cascade,
  aluno_id uuid not null references public.curso_perfis(id) on delete cascade,
  numero int not null,
  pontos numeric not null,
  nota numeric not null,
  contada boolean not null,
  form_response_id text unique,
  enviado_em timestamptz not null default now()
);
create index if not exists curso_tentativas_aluno_av on public.curso_tentativas (aluno_id, avaliacao_id);

create table if not exists public.curso_respostas_pendentes (
  id uuid primary key default gen_random_uuid(),
  avaliacao_id uuid references public.curso_avaliacoes(id) on delete cascade,
  cpf_informado text,
  nome_informado text,
  associacao_informada text,
  pontos numeric,
  motivo text not null,
  form_response_id text unique,
  resolvido boolean not null default false,
  enviado_em timestamptz not null default now()
);

create table if not exists public.curso_config (
  chave text primary key,
  valor text not null
);

alter table public.curso_tentativas enable row level security;
alter table public.curso_respostas_pendentes enable row level security;
alter table public.curso_config enable row level security;

create policy curso_tentativas_admin on public.curso_tentativas for select using (public.curso_is_admin());
create policy curso_tentativas_aluno on public.curso_tentativas for select using (aluno_id = auth.uid());
create policy curso_pendentes_admin on public.curso_respostas_pendentes for all using (public.curso_is_admin()) with check (public.curso_is_admin());
-- curso_config: sem políticas = só a service_role acessa.

-- Registra uma tentativa e mantém a MAIOR nota; só as 2 primeiras tentativas contam.
create or replace function public.curso_registrar_tentativa(
  p_avaliacao uuid, p_aluno uuid, p_pontos numeric, p_response_id text
) returns table(numero int, nota numeric, contada boolean, nota_vigente numeric, duplicada boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_av public.curso_avaliacoes%rowtype;
  v_num int; v_nota numeric; v_contada boolean; v_vigente numeric; v_existente public.curso_tentativas%rowtype;
begin
  select * into v_av from public.curso_avaliacoes where id = p_avaliacao;
  if v_av.id is null or coalesce(v_av.pontos_totais, 0) <= 0 then
    raise exception 'avaliação inválida ou sem pontos_totais';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_aluno::text || p_avaliacao::text, 0));

  if p_response_id is not null then
    select * into v_existente from public.curso_tentativas where form_response_id = p_response_id;
    if found then
      select n.nota into v_vigente from public.curso_notas n where n.avaliacao_id = p_avaliacao and n.aluno_id = p_aluno;
      return query select v_existente.numero, v_existente.nota, v_existente.contada, v_vigente, true;
      return;
    end if;
  end if;

  select count(*) + 1 into v_num from public.curso_tentativas t where t.avaliacao_id = p_avaliacao and t.aluno_id = p_aluno;
  v_nota := round(p_pontos * v_av.nota_maxima / v_av.pontos_totais, 2);
  v_contada := v_num <= 2;

  insert into public.curso_tentativas (avaliacao_id, aluno_id, numero, pontos, nota, contada, form_response_id)
  values (p_avaliacao, p_aluno, v_num, p_pontos, v_nota, v_contada, p_response_id);

  if v_contada then
    insert into public.curso_notas (avaliacao_id, aluno_id, nota, observacoes)
    values (p_avaliacao, p_aluno, v_nota, 'Lançada automaticamente (tentativa ' || v_num || ')')
    on conflict (avaliacao_id, aluno_id) do update
      set nota = greatest(public.curso_notas.nota, excluded.nota),
          observacoes = case when excluded.nota > public.curso_notas.nota
                             then 'Lançada automaticamente (tentativa ' || v_num || ')'
                             else public.curso_notas.observacoes end,
          lancado_em = case when excluded.nota > public.curso_notas.nota then now() else public.curso_notas.lancado_em end;
  end if;

  select n.nota into v_vigente from public.curso_notas n where n.avaliacao_id = p_avaliacao and n.aluno_id = p_aluno;
  return query select v_num, v_nota, v_contada, v_vigente, false;
end $$;

revoke all on function public.curso_registrar_tentativa(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.curso_registrar_tentativa(uuid, uuid, numeric, text) to service_role;

insert into public.curso_config (chave, valor)
values ('forms_segredo', encode(gen_random_bytes(24), 'hex'))
on conflict (chave) do nothing;
