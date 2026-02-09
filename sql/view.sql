create view public.tickets_export_v as
with
  base as (
    select
      t.id,
      "left" (t.ticket, 4) as project_prefix,
      t.ticket,
      t.po,
      t.issue_type,
      t.suid,
      t.su_name,
      t.time_start,
      t.time_end,
      t.assignee_account,
      t.agent_handle_ticket,
      t.ticket_status_id,
      t.import_to_tracker,
      t.ot_mode
    from
      tickets t
  )
select
  b.id,
  case
    when b.project_prefix = 'AOPS'::text then 'AOPS'::text
    when b.project_prefix = 'FMOP'::text then 'FMOP'::text
    when b.ticket ~~ 'POS%'::text then 'AOPS'::text
    else 'Other'::text
  end as "Project",
  b.ticket as "Ticket",
  b.po as "PO",
  case
    when b.project_prefix = 'FMOP'::text
    and TRIM(
      both
      from
        b.issue_type
    ) ~~* 'Email Request'::text then 'Carrier Inquiry'::text
    when TRIM(
      both
      from
        b.issue_type
    ) = 'Cannot Print a BOL / Packing Slip or Shipping Label'::text then 'Cannot Print Shipping Documents'::text
    when TRIM(
      both
      from
        b.issue_type
    ) = 'Product Out of Stock'::text then 'Product Is Out of Stock'::text
    when TRIM(
      both
      from
        b.issue_type
    ) = 'Shipping/Carrier Questions'::text then 'Carrier Inquiry'::text
    when TRIM(
      both
      from
        b.issue_type
    ) = 'WDN First Mile Supplier Outreach'::text then 'WDN'::text
    when TRIM(
      both
      from
        b.issue_type
    ) = any (
      array[
        'Update Tracking Number'::text,
        'Update Tracking Number/ Order Status'::text
      ]
    ) then 'Update Tracking Number/Order Status'::text
    when TRIM(
      both
      from
        b.issue_type
    ) = any (
      array[
        'Change Pick up carrier'::text,
        'Change Pickup carrier'::text
      ]
    ) then 'Change Pickup Carrier'::text
    else TRIM(
      both
      from
        b.issue_type
    )
  end as "Ticket Type",
  (b.suid || ' - '::text) || b.su_name as "Supplier",
  to_char(
    (
      b.time_start AT TIME ZONE 'Asia/Ho_Chi_Minh'::text
    ),
    'HH24:MI:SS'::text
  ) as "Start Time",
  to_char(
    (b.time_end AT TIME ZONE 'Asia/Ho_Chi_Minh'::text),
    'HH24:MI:SS'::text
  ) as "End Time",
  va.name as "Name",
  a."Export_name" as "Account",
  ts.status_name as "Ticket Status",
  b.import_to_tracker,
  COALESCE(b.ot_mode, false) as "OT Mode"
from
  base b
  left join vcn_agent va on va.stt = b.agent_handle_ticket
  left join agent a on a.agent_account = b.assignee_account
  left join ticket_status ts on ts.id = b.ticket_status_id
where
  b.time_start is not null
  and b.time_end is not null
  and b.ticket_status_id is not null
  and b.agent_handle_ticket is not null
  and b.import_to_tracker = false
  and (
    (
      b.project_prefix = any (array['AOPS'::text, 'FMOP'::text])
    )
    or b.ticket ~~ 'POS%'::text
  )
  and (a.team IS NULL OR a.team = 'NA')  -- Only NA team tickets (or agents without team set)
order by
  b.time_start desc;