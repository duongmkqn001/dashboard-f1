-- Fix notifications table to support celebration and manual_schedule types
-- Run this SQL in your Supabase SQL Editor

-- Step 1: Drop the old constraint
ALTER TABLE public.notifications 
DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Step 2: Add new constraint with celebration and manual_schedule types
ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check CHECK (
  type = ANY (
    ARRAY[
      'mos_request'::text,
      'mos_approved'::text,
      'mos_rejected'::text,
      'leader_support'::text,
      'system'::text,
      'celebration'::text,
      'manual_schedule'::text
    ]
  )
);

-- Verify the constraint was updated
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'notifications_type_check';

