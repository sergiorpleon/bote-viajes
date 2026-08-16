-- Pega esto tal cual en el SQL Editor de tu proyecto Supabase y pulsa Run.
-- Crea el almacen clave/valor que usa src/storage.js en modo compartido.

create table if not exists kv (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz default now()
);

alter table kv enable row level security;

-- La app no tiene cuentas: quien tenga el enlace puede leer y escribir, que es
-- exactamente lo que hacia el artifact original. El enlace ES el secreto; si el
-- viaje es privado, no lo publiques.
drop policy if exists "acceso anonimo" on kv;
create policy "acceso anonimo" on kv
  for all
  to anon
  using (true)
  with check (true);
