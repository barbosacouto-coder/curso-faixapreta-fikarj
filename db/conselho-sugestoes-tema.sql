-- Curso FIKARJ — Melhoria 3: canal de sugestões de tema pelo conselho de mestres
-- Conselho é um registro de curso_perfis (role='conselho'), marcado pelo admin.
-- Cada mestre do conselho envia sugestões de tema de aula num só lugar; o
-- admin vê todas, decide o que produzir e pode marcar status/observação.
-- Nenhum mestre vê a sugestão de outro mestre (só o admin vê todas).

-- 1) Permite o novo valor de role.
alter table public.curso_perfis drop constraint curso_perfis_role_check;
alter table public.curso_perfis add constraint curso_perfis_role_check
  check (role = any (array['admin','aluno','professor','conselho']));

-- 2) Tabela de sugestões.
create table public.curso_sugestoes_tema (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references public.curso_perfis(id) on delete cascade,
  modulo_id uuid references public.curso_modulos(id) on delete set null,
  texto text not null,
  status text not null default 'nova' check (status = any (array['nova','em_analise','planejada','arquivada'])),
  observacao_admin text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.curso_sugestoes_tema enable row level security;

-- Mestre do conselho cria sugestão em seu próprio nome.
create policy curso_sugestoes_tema_insert on public.curso_sugestoes_tema
  for insert
  with check (
    autor_id = auth.uid()
    and exists (
      select 1 from public.curso_perfis p
      where p.id = auth.uid() and p.role = 'conselho' and p.ativo = true
    )
  );

-- Autor vê as próprias sugestões; admin vê todas.
create policy curso_sugestoes_tema_select on public.curso_sugestoes_tema
  for select
  using (autor_id = auth.uid() or curso_is_admin());

-- Só o admin atualiza (status, observação).
create policy curso_sugestoes_tema_update_admin on public.curso_sugestoes_tema
  for update
  using (curso_is_admin())
  with check (curso_is_admin());
