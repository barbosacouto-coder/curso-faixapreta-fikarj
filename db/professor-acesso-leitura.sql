-- Curso FIKARJ — Melhoria: acesso de leitura do professor filiado
-- Professor é um registro de curso_perfis (role='professor'); ele é o
-- presidente/responsável da associação e enxerga, somente leitura, os
-- alunos (role='aluno') da MESMA associação — progresso, notas e parecer
-- dos trabalhos (feedback). Nenhum dado de outras associações, nem de
-- outros professores/admin.
--
-- Também corrige uma falha de segurança pré-existente: a policy de update
-- "curso_perfis_update_self" permitia que QUALQUER usuário logado alterasse
-- o próprio registro em curso_perfis (incluindo role e associacao) sem
-- nenhuma restrição de coluna — abrindo caminho para autopromoção a
-- professor ou admin. Nenhuma tela do sistema depende desse autoajuste
-- (só o admin atualiza curso_perfis), então a policy é removida.

-- 1) Corrige a falha pré-existente: só o admin atualiza curso_perfis.
drop policy if exists curso_perfis_update_self on public.curso_perfis;
create policy curso_perfis_update_admin on public.curso_perfis
  for update
  using (curso_is_admin())
  with check (curso_is_admin());

-- 2) Permite o novo valor de role.
alter table public.curso_perfis drop constraint curso_perfis_role_check;
alter table public.curso_perfis add constraint curso_perfis_role_check
  check (role = any (array['admin','aluno','professor']));

-- 3) Função auxiliar: o usuário logado é o professor responsável pelo
--    aluno p_aluno_id (mesma associação, ambos ativos)?
create or replace function public.curso_is_professor_de(p_aluno_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.curso_perfis prof
    join public.curso_perfis aluno on aluno.id = p_aluno_id
    where prof.id = auth.uid()
      and prof.role = 'professor'
      and prof.ativo = true
      and aluno.role = 'aluno'
      and aluno.associacao is not null
      and aluno.associacao = prof.associacao
  );
$$;

-- 4) Estende as policies de leitura existentes para incluir o professor.
alter policy curso_perfis_select_self on public.curso_perfis
  using (id = auth.uid() or curso_is_admin() or curso_is_professor_de(id));

alter policy curso_progresso_select on public.curso_progresso
  using (aluno_id = auth.uid() or curso_is_admin() or curso_is_professor_de(aluno_id));

alter policy curso_submissoes_select on public.curso_submissoes
  using (aluno_id = auth.uid() or curso_is_admin() or curso_is_professor_de(aluno_id));

alter policy curso_notas_select on public.curso_notas
  using (aluno_id = auth.uid() or curso_is_admin() or curso_is_professor_de(aluno_id));

alter policy curso_certificados_select on public.curso_certificados
  using (aluno_id = auth.uid() or curso_is_admin() or curso_is_professor_de(aluno_id));

alter policy curso_assistencia_select on public.curso_assistencia
  using (aluno_id = auth.uid() or curso_is_admin() or curso_is_professor_de(aluno_id));

alter policy curso_tarefa_marcas_select on public.curso_tarefa_marcas
  using (aluno_id = auth.uid() or curso_is_admin() or curso_is_professor_de(aluno_id));
