# Controle de Visitas

Aplicação web **mobile-first** para controlar visitas em endereços de São Paulo.
Sem login: qualquer pessoa com o link consulta e atualiza os registros.

Stack: **Vite + JavaScript puro (ESM) + Tailwind CSS 4 + Supabase**, hospedada na **Netlify**.

## Estrutura

```text
controle-visitas/
├── index.html
├── package.json
├── vite.config.js
├── netlify.toml
├── supabase/
│   └── schema.sql        # SQL completo (tabela, índices, RLS, grants)
├── src/
│   ├── main.js
│   ├── style.css
│   └── supabase.js
└── README.md
```

## 1. Instalar as dependências

```bash
npm install
```

## 2. Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```text
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publica
```

Use somente a chave pública (`publishable` / `anon`).
**Nunca** coloque a `service_role key` no frontend — ela ignora todas as regras de RLS.

## 3. Rodar localmente

```bash
npm run dev
```

## 4. Gerar a versão final

```bash
npm run build     # gera a pasta dist/
npm run preview   # serve a build localmente
```

## 5. Executar o SQL no Supabase

1. Abra o projeto no [Supabase](https://supabase.com).
2. Vá em **SQL Editor → New query**.
3. Cole o conteúdo de `supabase/schema.sql` e clique em **Run**.

O script cria a tabela:

```sql
create table enderecos (
  id bigint generated always as identity primary key,
  territorio text not null,
  endereco text not null,
  cidade text not null,
  estado text not null,
  tem_estrangeiro boolean default null,
  visita_concluida boolean not null default false,
  observacao text,
  atualizado_em timestamptz not null default now()
);
```

E os índices:

```sql
create index idx_enderecos_territorio on enderecos (territorio);
create index idx_enderecos_cidade on enderecos (cidade);
```

`tem_estrangeiro` tem três estados: `null` (sem resposta), `true` (tem estrangeiro)
e `false` (não tem estrangeiro).

## 6. Importar os endereços

Opção A — **planilha CSV** (recomendado):

1. Crie um CSV com o cabeçalho `territorio,endereco,cidade,estado`.
2. No Supabase: **Table Editor → enderecos → Insert → Import data from CSV**.
3. Não inclua a coluna `id`; ela é gerada automaticamente.

Opção B — **SQL**:

```sql
insert into enderecos (territorio, endereco, cidade, estado) values
  ('Zona Norte', 'Rua Exemplo, 100', 'São Paulo', 'SP'),
  ('Zona Sul',   'Av. Modelo, 250',  'São Paulo', 'SP');
```

Os botões de território da interface são gerados a partir dos valores distintos
da coluna `territorio` — não há regiões fixas no código.

## 7. Políticas RLS públicas

O `schema.sql` já configura tudo:

```sql
alter table enderecos enable row level security;

create policy "leitura publica" on enderecos
for select to anon, authenticated using (true);

create policy "atualizacao publica" on enderecos
for update to anon, authenticated using (true) with check (true);

revoke all on table enderecos from anon, authenticated;
grant select on table enderecos to anon, authenticated;
grant update (tem_estrangeiro, visita_concluida, observacao, atualizado_em)
  on table enderecos to anon, authenticated;
```

Resultado:

- **Permitido ao público**: consultar os endereços e atualizar `tem_estrangeiro`,
  `visita_concluida`, `observacao` e `atualizado_em`.
- **Bloqueado**: inserir registros, excluir registros e alterar `territorio`,
  `endereco`, `cidade` ou `estado` (não há policy de INSERT/DELETE e os GRANTs
  de UPDATE são por coluna).

## 8. Publicar na Netlify

1. Suba este projeto para um repositório no GitHub.
2. Na Netlify: **Add new site → Import an existing project → GitHub** e escolha o repositório.
3. As configurações vêm do `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Em **Site settings → Environment variables**, adicione:

   ```text
   VITE_SUPABASE_URL=https://seu-projeto.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publica
   ```

5. Clique em **Deploy site**. Depois de alterar variáveis de ambiente é preciso
   refazer o deploy (**Trigger deploy → Clear cache and deploy site**), porque o
   Vite injeta os valores em tempo de build.

## 9. Risco de não haver login

Este site é **totalmente público**:

- Qualquer pessoa que tenha (ou descubra) o endereço do site enxerga **todos** os
  endereços cadastrados e pode marcar, desmarcar e escrever observações.
- A chave pública fica visível no código do navegador — isso é esperado e seguro
  apenas porque as regras de RLS limitam o que ela pode fazer.
- Não há histórico de quem alterou o quê, nem como desfazer uma alteração feita
  por engano.
- Não escreva dados pessoais sensíveis no campo de observação.

Se isso for um problema, ative o Supabase Auth (e-mail mágico, por exemplo) e
troque as policies de `to anon, authenticated` para `to authenticated`.

## Funcionalidades

- Menu horizontal de territórios carregado do banco, com botão "Todos" e rolagem
  horizontal; o último território escolhido é lembrado no `localStorage`.
- Busca instantânea em território, endereço, cidade e estado (ignora acentos).
- Filtro de status: todos, sem resposta, tem estrangeiro, não tem estrangeiro,
  visita concluída.
- Cartões com status textual, selos e indicador de visita concluída; área
  expansível com animação para responder, observar, concluir a visita e abrir o
  endereço no Google Maps.
- Resumo com totais recalculados a cada alteração.
- Ordenação fixa por território, cidade e endereço.
- Estados de carregamento, mensagens de sucesso/erro e botão "Tentar novamente".
- Acessibilidade: `button` reais, `aria-expanded`, `aria-pressed`, `aria-label`,
  navegação por teclado, alvos grandes e status também em texto.
