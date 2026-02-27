create table public.suppliers (
  suid text not null,
  suname text null,
  created_at timestamp with time zone not null default now(),
  constraint suppliers_pkey primary key (suid)
) TABLESPACE pg_default;