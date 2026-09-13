-- =====================================================================
-- Controle de Visitas — estrutura completa do banco (Supabase/Postgres)
-- Execute este arquivo inteiro no SQL Editor do Supabase.
-- =====================================================================

-- 1) Tabela principal ---------------------------------------------------

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

-- 2) Índices de busca ---------------------------------------------------

create index idx_enderecos_territorio
on enderecos (territorio);

create index idx_enderecos_cidade
on enderecos (cidade);

-- 3) Row Level Security -------------------------------------------------
-- O site é público (sem login), então todo acesso usa os papéis
-- `anon` (visitante) e `authenticated`.

alter table enderecos enable row level security;

-- Leitura pública de todos os endereços.
create policy "leitura publica"
on enderecos
for select
to anon, authenticated
using (true);

-- Atualização pública de todos os endereços.
-- Não existem policies de INSERT nem de DELETE: portanto o frontend
-- público NÃO consegue criar nem excluir registros.
create policy "atualizacao publica"
on enderecos
for update
to anon, authenticated
using (true)
with check (true);

-- 4) Permissões por coluna ---------------------------------------------
-- A policy acima autoriza a linha; os GRANTs abaixo limitam QUAIS colunas
-- podem ser alteradas pelo público. Território, endereço, cidade e estado
-- ficam protegidos contra alteração pelo site.

revoke all on table enderecos from anon, authenticated;

grant select on table enderecos to anon, authenticated;

grant update (tem_estrangeiro, visita_concluida, observacao, atualizado_em)
on table enderecos to anon, authenticated;

-- 5) Garantia extra do carimbo de tempo ---------------------------------
-- O frontend envia `atualizado_em`, mas o trigger garante o valor correto
-- mesmo que alguém envie uma data inválida.

create or replace function set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger trg_enderecos_atualizado_em
before update on enderecos
for each row
execute function set_atualizado_em();

-- 6) Dados de exemplo (opcional) ----------------------------------------
-- insert into enderecos (territorio, endereco, cidade, estado) values
--   ('Zona Norte', 'Rua Exemplo, 100', 'São Paulo', 'SP'),
--   ('Zona Sul',   'Av. Modelo, 250',  'São Paulo', 'SP');
