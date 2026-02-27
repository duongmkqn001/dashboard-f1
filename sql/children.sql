create table public.children (
  suchildid text not null,
  "parentSuid" text null,
  created_at timestamp with time zone not null default now(),
  constraint children_pkey primary key (suchildid),
  constraint children_parentSuid_fkey foreign KEY ("parentSuid") references suppliers (suid) on delete CASCADE
) TABLESPACE pg_default;