create table public.vcn_agent (
  stt serial not null,
  name text not null,
  account_name text null,
  account_password text null,
  level text null,
  status text not null default 'active'::text,
  constraint vcn_agent_pkey primary key (stt),
  constraint vcn_agent_account_name_key unique (account_name)
) TABLESPACE pg_default;