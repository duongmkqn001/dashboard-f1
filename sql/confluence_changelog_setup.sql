-- ============================================================================
-- CONFLUENCE PAGES CHANGELOG TRACKING
-- ============================================================================
-- Purpose: Store page metadata snapshots from Confluence and track changes
--          over time. A GitHub Actions Python script compares the latest
--          Confluence API response against this table and updates/inserts
--          changed pages. Any new version detected triggers a Discord webhook.
--
-- Source:  Confluence Cloud REST API v1
-- Target:  https://wayfaircorp.atlassian.net (GPS space)
-- ============================================================================

-- ============================================================================
-- STEP 1: CONFLUENCE_PAGES — snapshot of monitored pages
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.confluence_pages (
    id              BIGINT PRIMARY KEY,           -- Confluence page ID
    title           TEXT NOT NULL,
    space_key       TEXT NOT NULL DEFAULT 'GPS',
    version_number  INTEGER NOT NULL DEFAULT 0,
    version_when    TIMESTAMPTZ,
    version_by_name TEXT,
    body_length     INTEGER,                       -- length of storage body
    body_hash       TEXT,                          -- SHA-256 of body content (detects real edits)
    labels          TEXT[],                        -- array of label names
    parent_id       BIGINT,
    root_url        TEXT,                          -- full Confluence view URL
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT confluence_pages_id_unique UNIQUE (id)
);

COMMENT ON TABLE public.confluence_pages IS
    'Confluence page snapshots for change detection. Updated by GitHub Actions confluence-monitor workflow.';

-- ============================================================================
-- STEP 2: CONFLUENCE_CHANGELOG — immutable audit log of all page changes
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.confluence_changelog (
    id              BIGSERIAL PRIMARY KEY,
    page_id         BIGINT NOT NULL REFERENCES public.confluence_pages(id) ON DELETE CASCADE,
    page_title      TEXT NOT NULL,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    change_type     TEXT NOT NULL CHECK (change_type IN ('new', 'updated', 'content_changed', 'relabeled', 'deleted')),
    old_version     INTEGER,
    new_version     INTEGER,
    old_hash        TEXT,
    new_hash        TEXT,
    changed_by      TEXT,
    changed_by_name TEXT,
    diff_summary    TEXT,                          -- human-readable diff note
    notified_at      TIMESTAMPTZ                   -- NULL = not yet sent to Discord
);

COMMENT ON TABLE public.confluence_changelog IS
    'Immutable change log for Confluence page updates. Each row = one detected change. notified_at = sent to Discord.';

-- ============================================================================
-- STEP 3: INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_confluence_pages_space
    ON public.confluence_pages (space_key);

CREATE INDEX IF NOT EXISTS idx_confluence_pages_last_checked
    ON public.confluence_pages (last_checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_confluence_changelog_page_id
    ON public.confluence_changelog (page_id DESC);

CREATE INDEX IF NOT EXISTS idx_confluence_changelog_changed_at
    ON public.confluence_changelog (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_confluence_changelog_notified
    ON public.confluence_changelog (notified_at)
    WHERE notified_at IS NULL;

-- ============================================================================
-- STEP 4: TRACK PAGE CHANGE (upsert + changelog insert)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.track_confluence_change(
    p_page_id         BIGINT,
    p_title           TEXT,
    p_space_key       TEXT DEFAULT 'GPS',
    p_new_version     INTEGER,
    p_version_when    TIMESTAMPTZ,
    p_version_by_name TEXT,
    p_body_content    TEXT,
    p_labels          TEXT[],
    p_parent_id       BIGINT,
    p_change_type     TEXT  -- 'new' | 'updated' | 'content_changed' | 'relabeled'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_existing     RECORD;
    v_old_version  INTEGER;
    v_old_hash     TEXT;
    v_change_type  TEXT := p_change_type;
    v_log_id       BIGINT;
    v_diff_summary TEXT;
    v_result       JSONB;
BEGIN
    -- Look up existing page
    SELECT id, version_number, body_hash INTO v_existing
      FROM public.confluence_pages
     WHERE id = p_page_id;

    IF v_existing IS NULL THEN
        -- NEW page
        v_change_type := 'new';
        v_old_version := NULL;
        v_old_hash    := NULL;
        v_diff_summary := 'Page first detected: v' || p_new_version::TEXT;

        INSERT INTO public.confluence_pages
            (id, title, space_key, version_number, version_when, version_by_name,
             body_length, body_hash, labels, parent_id, root_url, first_seen_at, last_checked_at)
        VALUES
            (p_page_id, p_title, p_space_key, p_new_version, p_version_when, p_version_by_name,
             char_length(p_body_content),
             encode(sha256(p_body_content::BYTEA), 'hex'),
             p_labels, p_parent_id,
             'https://wayfaircorp.atlassian.net/wiki/spaces/' || p_space_key || '/pages/' || p_page_id,
             NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;

        v_diff_summary := 'New page detected: ' || p_title || ' (v' || p_new_version || ')';

    ELSE
        -- EXISTING page — update
        v_old_version := v_existing.version_number;
        v_old_hash    := v_existing.body_hash;

        UPDATE public.confluence_pages SET
            title            = p_title,
            version_number   = p_new_version,
            version_when     = p_version_when,
            version_by_name  = p_version_by_name,
            body_length      = char_length(p_body_content),
            body_hash        = encode(sha256(p_body_content::BYTEA), 'hex'),
            labels           = p_labels,
            parent_id        = p_parent_id,
            last_checked_at  = NOW()
        WHERE id = p_page_id;

        -- Determine change type by what actually changed
        IF p_change_type = 'updated' AND v_old_hash IS NOT NULL THEN
            IF encode(sha256(p_body_content::BYTEA), 'hex') != v_old_hash THEN
                v_change_type  := 'content_changed';
                v_diff_summary := p_title || ': content edited (v' || v_old_version || ' → v' || p_new_version || ')';
            ELSE
                v_diff_summary := p_title || ': metadata only (v' || v_old_version || ' → v' || p_new_version || ') — no content change';
            END IF;
        ELSIF v_change_type = 'relabeled' THEN
            v_diff_summary := p_title || ': labels changed (v' || v_old_version || ')';
        ELSE
            v_diff_summary := p_title || ': v' || v_old_version || ' → v' || p_new_version;
        END IF;
    END IF;

    -- Insert changelog entry (always — even if version unchanged, we logged the check)
    IF v_old_version IS DISTINCT FROM p_new_version THEN
        INSERT INTO public.confluence_changelog
            (page_id, page_title, change_type, old_version, new_version,
             old_hash, new_hash, changed_by, changed_by_name, diff_summary)
        VALUES
            (p_page_id, p_title, v_change_type, v_old_version, p_new_version,
             v_old_hash,
             encode(sha256(coalesce(p_body_content, '')::BYTEA), 'hex'),
             NULL, p_version_by_name, v_diff_summary)
        RETURNING id INTO v_log_id;

        v_result := jsonb_build_object(
            'log_id',      v_log_id,
            'change_type', v_change_type,
            'old_version', v_old_version,
            'new_version', p_new_version,
            'summary',     v_diff_summary
        );
    ELSE
        -- Version unchanged — still update last_checked_at but no changelog row
        v_result := jsonb_build_object(
            'log_id',      NULL,
            'change_type', 'unchanged',
            'summary',     p_title || ': no version change (v' || p_new_version || ')'
        );
    END IF;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.track_confluence_change IS
    'Upsert a Confluence page snapshot and write to changelog if version changed. Returns change metadata.';

-- ============================================================================
-- STEP 5: MARK CHANGELOG AS NOTIFIED (after Discord webhook sent)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_confluence_notified(
    p_log_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.confluence_changelog
       SET notified_at = NOW()
     WHERE id = p_log_id
       AND notified_at IS NULL;
END;
$$;

-- ============================================================================
-- STEP 6: VIEW — un-notified changes (pending Discord)
-- ============================================================================
CREATE OR REPLACE VIEW public.confluence_pending_notifications AS
SELECT
    c.id        AS changelog_id,
    c.page_id,
    c.page_title,
    c.changed_at,
    c.change_type,
    c.old_version,
    c.new_version,
    c.diff_summary,
    c.changed_by_name,
    p.space_key,
    p.root_url
FROM public.confluence_changelog c
JOIN public.confluence_pages p ON p.id = c.page_id
WHERE c.notified_at IS NULL
ORDER BY c.changed_at DESC;

COMMENT ON VIEW public.confluence_pending_notifications IS
    'Changes in Confluence that have not yet been sent to Discord webhook.';

-- ============================================================================
-- STEP 7: VIEW — recent changelog (last 7 days)
-- ============================================================================
CREATE OR REPLACE VIEW public.confluence_recent_changes AS
SELECT
    c.id             AS changelog_id,
    p.id             AS page_id,
    p.title,
    p.space_key,
    p.root_url       AS page_url,
    c.changed_at,
    c.change_type,
    c.old_version,
    c.new_version,
    c.diff_summary,
    c.changed_by_name,
    CASE
        WHEN c.notified_at IS NOT NULL THEN 'sent'
        ELSE 'pending'
    END AS notification_status
FROM public.confluence_changelog c
JOIN public.confluence_pages p ON p.id = c.page_id
WHERE c.changed_at >= NOW() - INTERVAL '7 days'
ORDER BY c.changed_at DESC;

COMMENT ON VIEW public.confluence_recent_changes IS
    'All Confluence page changes in the last 7 days, with notification status.';

-- ============================================================================
-- STEP 8: SEED — register the known GPS space pages for first run
-- ============================================================================
-- These are the pages that will be monitored. Add/remove rows to expand scope.
INSERT INTO public.confluence_pages
    (id, title, space_key, version_number, root_url, last_checked_at)
VALUES
    -- Order to Delivery Journey page (known from CONFLUENCE_API_DOCUMENTATION.md)
    (1256185536, 'Order to Delivery Journey - VCN', 'GPS', 2,
     'https://wayfaircorp.atlassian.net/wiki/spaces/GPS/pages/1256185536', NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STEP 9: PERMISSIONS
-- ============================================================================
-- Dashboard (anon key) gets read access
GRANT SELECT ON public.confluence_pages TO anon;
GRANT SELECT ON public.confluence_changelog TO anon;
GRANT SELECT ON public.confluence_pending_notifications TO anon;
GRANT SELECT ON public.confluence_recent_changes TO anon;

-- Service role and GitHub Actions service account get full access
GRANT ALL ON public.confluence_pages TO service_role;
GRANT ALL ON public.confluence_changelog TO service_role;
GRANT USAGE, SELECT ON SEQUENCE confluence_changelog_id_seq TO service_role;

-- ============================================================================
-- STEP 10: DONE
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ CONFLUENCE CHANGELOG MIGRATION COMPLETE';
    RAISE NOTICE '';
    RAISE NOTICE '   • Tables:      public.confluence_pages, public.confluence_changelog';
    RAISE NOTICE '   • Functions:  track_confluence_change, mark_confluence_notified';
    RAISE NOTICE '   • Views:      confluence_pending_notifications, confluence_recent_changes';
    RAISE NOTICE '   • Seeded:     1 page (ID 1256185536 — Order to Delivery Journey - VCN)';
    RAISE NOTICE '';
    RAISE NOTICE 'Next: deploy .github/workflows/confluence-monitor.yml + add GitHub Secrets.';
END
$$;
