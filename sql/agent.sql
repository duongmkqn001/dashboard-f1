create table public.agent (
  stt integer not null,
  agent_account text not null,
  agent_name text not null,
  signature_name text null,
  "Export_name" text null,
  team text null,
  constraint agent_pkey primary key (stt),
  constraint agent_agent_account_key unique (agent_account)
) TABLESPACE pg_default;

create index IF not exists idx_agent_team on public.agent using btree (team) TABLESPACE pg_default;