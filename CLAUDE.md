# CLAUDE.md — Sistema de Formação de Faixas Pretas (FIKARJ)

## 1. Objetivo do projeto

Construir um sistema web (LMS simplificado) para o Curso de Formação de Faixas
Pretas da FIKARJ (Federação Interestilos de Karate do Rio de Janeiro), onde:

- O admin (Roosevelt, presidente da FIKARJ) posta aulas, cursos online, vídeos
  de treinamento, tarefas e avaliações.
- Os alunos (faixa marrom 1º Kyu e faixas pretas 1º a 7º Dan, ~88 nesta fase —
  ver revisão de 28/10/2026 no item 2) acessam o conteúdo, assistem aos
  vídeos, cumprem tarefas e avaliações, e enviam seus trabalhos.
- O admin tem controle total e visibilidade de tudo que cada aluno fez (aulas
  assistidas, tarefas entregues, notas, status de conclusão).
- Ao final do curso, o sistema calcula a conclusão do aluno e emite um
  certificado / status de aprovação.

## 2. Contexto (não inventar além disto)

- Organização: FIKARJ (federação de karatê que o usuário fundou e preside).
- Infraestrutura existente que será **reaproveitada**:
  - Projeto Supabase ativo: `fikarj-carteirinhas` (id: `jhvbpssigakvhjfjqazc`,
    região `sa-east-1`), hoje usado pelo Portal FIKARJ (carteirinha digital).
    As tabelas existentes (`atletas`, `associacoes`, `admins`,
    `login_tentativas`) são de outro sistema e **não devem ser alteradas**.
    O curso usa tabelas novas, com prefixo `curso_`, no mesmo projeto.
  - Conta GitHub: `barbosacouto-coder` (hoje hospeda o repositório
    `carteirinha-fikarj` via GitHub Pages, com domínio customizado
    `portalfikarj.com.br`). O curso vai para um **repositório novo e separado**
    (nome a definir na Etapa 6), também via GitHub Pages.
- Vídeos das aulas: hospedados no YouTube como "não listado", embutidos
  (embed) no sistema — sem custo, sem limite de espaço.
- Escala esperada: ~88 alunos (revisado em 28/10/2026 — ver abaixo), não mais
  os ~30 estimados no planejamento inicial.
- Administração: só o próprio usuário (Roosevelt) administra o conteúdo,
  avalia tarefas e cria contas de aluno. Não há outros instrutores nesta fase.
- **Criação de contas de aluno (revisado em 28/10/2026)**: a tabela
  `atletas` (já existente, do Portal FIKARJ) não tem campo de e-mail, então
  o fluxo original de "admin digita nome+e-mail" foi trocado por:
  - **Login do aluno por CPF + data de nascimento**, igual ao Portal FIKARJ
    (não por e-mail/senha). Por baixo dos panos o sistema ainda usa Supabase
    Auth (sessão real, RLS funcionando normalmente) através de um e-mail
    sintético interno gerado a partir do CPF — o aluno nunca vê isso.
  - **Importação em massa pelo admin**: uma função traz automaticamente da
    tabela `atletas` todos os atletas elegíveis (graduação `MARROM 1º KYU`
    — incluindo variações com "pontas preta" — e qualquer `PRETA … DAN`),
    já com nome, registro FIKARJ, CNKB e associação preenchidos. Atletas em
    "2º Kyu com ponta preta" ficam de fora da importação automática (decisão
    do usuário); podem ser adicionados manualmente depois se necessário.
  - Continua sendo possível adicionar um aluno avulso manualmente (ex.:
    alguém fora da base de atletas), usando CPF + data de nascimento em vez
    de e-mail.
  - Isso ainda não é autocadastro aberto: o aluno só existe no sistema
    depois que o admin importou/cadastrou — ver restrição no item 8.
- Trabalhos enviados pelos alunos: podem ser documentos/imagens (upload de
  arquivo) OU vídeos gravados pelo aluno (enviados como link externo —
  YouTube/Drive do próprio aluno, não upload direto, para não esgotar o
  armazenamento gratuito).
- Orçamento: zero. Toda a solução deve usar apenas camadas/tiers gratuitos
  (Supabase free tier, GitHub Pages, YouTube).
- Usuário tem pouco conhecimento de informática/IA — o painel admin precisa
  ser simples de usar, e a documentação final deve ser passo a passo.

Qualquer informação que não esteja listada aqui e que seja necessária para
avançar uma etapa deve ser **perguntada ao usuário**, nunca presumida.

## 3. Estrutura do projeto (raiz)

```
curso-faixapreta-fikarj/          ← raiz do projeto (este diretório)
├── CLAUDE.md                     ← este arquivo
├── db/                           ← scripts/migrações SQL (Etapa 1)
├── functions/                    ← Edge Functions do Supabase (Etapa 2)
├── admin/                        ← painel do administrador (Etapa 3)
├── aluno/                        ← painel do aluno (Etapa 4)
├── certificado/                  ← geração de certificado/PDF (Etapa 5)
└── docs/                         ← manual de uso para o admin (Etapa 8)
```
(Pastas serão criadas conforme cada etapa for executada — não criar
antecipadamente.)

## 4. Tecnologia

- **Backend/dados**: Supabase (Postgres + Auth + Storage + Edge Functions),
  projeto existente `fikarj-carteirinhas`.
- **Frontend**: HTML/CSS/JS estático (sem framework pesado), no mesmo
  padrão do Portal FIKARJ já existente, hospedado em GitHub Pages.
- **Vídeo**: embed do YouTube (não listado).
- **Armazenamento de arquivos**: Supabase Storage (bucket para materiais do
  admin, bucket para trabalhos dos alunos — só documentos/imagens).
- **Certificado**: geração de PDF no navegador (ex.: jsPDF) a partir dos
  dados de conclusão calculados no banco.

## 5. Etapas do projeto (ordem de execução obrigatória)

> **Regra de execução**: cada etapa abaixo é um bloco independente.
> Ao final de cada etapa, parar, apresentar o resultado e a forma de
> verificação, e **esperar a aprovação explícita do usuário** antes de
> iniciar a etapa seguinte. Nunca avançar etapas automaticamente.

1. **Modelagem de dados**: criar tabelas `curso_perfis`, `curso_modulos`,
   `curso_aulas`, `curso_tarefas`, `curso_submissoes`, `curso_progresso`,
   `curso_avaliacoes`, `curso_certificados` no projeto Supabase existente,
   com Row Level Security (aluno só vê/edita o que é dele; admin vê tudo) e
   buckets de Storage (`curso-materiais`, `curso-trabalhos`).
   - *Resultado esperado*: schema aplicado, RLS ativo e documentado.
   - *Verificação*: consultas de teste simulando sessão de aluno comum vs.
     sessão de admin, confirmando que cada um só acessa o que deveria.

2. **Criação de contas de aluno pelo admin** (redesenhado em 28/10/2026):
   três Edge Functions seguras (service_role só no servidor): (a) importação
   em massa a partir da tabela `atletas` para quem é elegível (marrom 1º Kyu
   e faixas pretas), (b) cadastro avulso de 1 aluno fora da base, (c) login
   do aluno por CPF + data de nascimento (gera uma sessão real do Supabase
   por baixo dos panos, sem o aluno nunca ver e-mail/senha).
   - *Resultado esperado*: admin importa os alunos elegíveis de uma vez;
     consegue também cadastrar 1 aluno avulso; aluno consegue logar só com
     CPF + nascimento.
   - *Verificação*: teste ponta a ponta — importação real executada, 1 login
     de aluno testado com CPF/nascimento reais.

3. **Painel do administrador**: telas para criar/editar módulos, aulas
   (com vídeo do YouTube), tarefas e avaliações; listar alunos e progresso;
   corrigir/avaliar trabalhos enviados.
   - *Resultado esperado*: painel admin funcional localmente.
   - *Verificação*: roteiro manual — criar módulo → aula → tarefa → avaliação.

4. **Painel do aluno**: login, lista de aulas com vídeo embutido e marcação
   de "assisti", envio de tarefas (upload de arquivo ou link de vídeo),
   visualização de notas/feedback e progresso geral.
   - *Resultado esperado*: painel aluno funcional localmente.
   - *Verificação*: simulação ponta a ponta com 1 aluno de teste.

5. **Regra de conclusão e certificado**: lógica que calcula se o aluno
   cumpriu tudo (aulas obrigatórias assistidas + tarefas aprovadas + nota
   mínima nas avaliações) e gera o certificado em PDF.
   - *Resultado esperado*: certificado gerado corretamente só quando os
     critérios são cumpridos.
   - *Verificação*: testar com 1 aluno que cumpre tudo e 1 que não cumpre.

6. **Publicação (deploy)**: criar repositório GitHub novo, configurar
   GitHub Pages, publicar o painel admin e o painel aluno.
   - *Resultado esperado*: sistema acessível por um link público.
   - *Verificação*: checklist de publicação + acesso real pelo link.

7. **Revisão de segurança**: auditoria de RLS, chaves expostas no
   frontend, tentativa de acesso indevido entre contas de aluno e ao painel
   admin.
   - *Resultado esperado*: relatório de auditoria com achados e correções
     aplicadas.
   - *Verificação*: casos de teste de segurança documentados, todos
     passando.

8. **Documentação para o admin**: manual simples e ilustrado de como usar
   o painel (criar aluno, postar aula, corrigir tarefa, emitir certificado).
   - *Resultado esperado*: guia curto em PDF/documento.
   - *Verificação*: usuário consegue seguir o guia sem ajuda.

## 6. Modelo e esforço recomendado por etapa

| Etapa | Modelo recomendado | Esforço | Por quê |
|---|---|---|---|
| 1. Modelagem de dados | Sonnet | Alto | SQL/RLS estruturado; decisões de segurança importam, mas é trabalho padrão que Sonnet resolve bem sem o custo de Opus. |
| 2. Criação de contas (Edge Function) | Sonnet | Alto | Envolve chave de serviço e autenticação — vale esforço alto, mas não precisa de Opus salvo complicação inesperada. |
| 3. Painel do admin | Sonnet | Médio-alto | Muita tela, mas é CRUD repetitivo — bom equilíbrio custo/qualidade. |
| 4. Painel do aluno | Sonnet | Médio-alto | Mesma natureza da etapa 3. |
| 5. Regra de conclusão/certificado | Sonnet | Médio | Lógica de negócio pontual, baixo risco. |
| 6. Publicação/deploy | Sonnet | Médio | Configuração mecânica, mas erros de configuração custam retrabalho — não vale baixar para Haiku. |
| 7. Revisão de segurança | **Opus** | Alto | Única etapa onde vale subir de modelo: erro de segurança em dados de alunos/avaliações tem custo alto; exige raciocínio adversarial mais cuidadoso. |
| 8. Documentação para o admin | Sonnet | Baixo-médio | Tarefa de redação, baixo risco técnico. |

## 7. Quando trocar de modelo ou subir o esforço

- Suba para **Opus** e esforço **alto** sempre que a etapa envolver decisões
  de segurança (RLS, chaves, autenticação) ou uma mudança estrutural cara de
  desfazer depois — não só na Etapa 7, mas em qualquer etapa se, no meio do
  trabalho, aparecer um problema desse tipo.
- **Haiku** só se justifica para tarefas mecânicas, repetitivas e de baixo
  risco (ex.: pequenos ajustes de texto/CSS já definidos). Neste projeto o
  volume desse tipo de tarefa é pequeno — não é recomendado como padrão.
- Se uma etapa falhar na verificação ou revelar uma ambiguidade nova, **parar
  e reavaliar** modelo/esforço antes de tentar de novo — não insistir no
  mesmo nível se o primeiro resultado vier errado.
- Trocar de modelo nunca deve acontecer no meio de uma etapa sem avisar o
  usuário.

## 8. Regras e restrições

- **Nunca** alterar as tabelas existentes do projeto Supabase
  (`atletas`, `associacoes`, `admins`, `login_tentativas`) — são de outro
  sistema (Portal FIKARJ).
- **Nunca** expor a `service_role key` do Supabase no frontend/código
  público — toda operação sensível (criar aluno, etc.) passa por Edge
  Function.
- **Nunca** permitir autocadastro aberto de alunos — contas só são criadas
  pelo admin.
- **Nunca** armazenar vídeo de aula ou vídeo de trabalho do aluno dentro do
  Supabase Storage — vídeos sempre por link externo (YouTube/Drive), para
  não esgotar o plano gratuito.
- Toda a solução deve permanecer **dentro de camadas gratuitas** (Supabase
  free tier, GitHub Pages). Se qualquer etapa exigir upgrade pago, **parar e
  perguntar** antes de prosseguir.
- Cada etapa é executada **separadamente**; não avançar para a etapa
  seguinte sem aprovação explícita do usuário.
- Não inventar dados, nomes de alunos, conteúdo de aulas ou critérios de
  avaliação que o usuário não tenha fornecido — perguntar quando faltar
  informação relevante.

## 9. Padrões de trabalho

- Linguagem da interface e de toda comunicação com o usuário: português do
  Brasil.
- Visual consistente com o que já existe no Portal FIKARJ (cores da
  identidade visual oficial: azul #00AFEF, verde #009C37, vermelho #BC002D).
- Código simples e direto, sem frameworks pesados, pensando que quem vai dar
  manutenção no futuro tem pouco conhecimento técnico.
- Qualquer decisão técnica com mais de uma opção razoável deve ser
  apresentada ao usuário antes de ser tomada, não decidida silenciosamente.

## 10. Critérios de conclusão do projeto

- Admin consegue, pelo painel, sem ajuda técnica: criar módulo/aula/tarefa,
  criar conta de aluno, corrigir trabalho enviado e emitir certificado.
- Aluno consegue, pelo painel: logar, assistir aulas, enviar tarefas, ver
  notas/feedback e, ao concluir tudo, visualizar/baixar seu certificado.
- RLS testado e confirmando que nenhum aluno acessa dados de outro aluno ou
  do painel admin.
- Sistema publicado e acessível por um link, sem custo recorrente.
- Manual de uso entregue e validado pelo usuário.
