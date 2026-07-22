-- ============================================================================
-- SOP & TEMPLATES DATA STORAGE SCHEMA
-- ============================================================================
-- Purpose: Store extracted SOP tables and Templates from Confluence
--          for dashboard display without requiring Confluence API calls
--
-- Source:  Confluence API - SOP and Templates pages
-- Target:  https://pfbxtbydrjcmqlrklsdr.supabase.co
-- ============================================================================

-- ============================================================================
-- STEP 1: SOP DATA STORAGE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.confluence_sop_data (
    id              BIGSERIAL PRIMARY KEY,
    page_id         BIGINT NOT NULL,
    page_title      TEXT NOT NULL,
    table_index     INTEGER NOT NULL DEFAULT 0,
    table_title     TEXT,
    headers         JSONB NOT NULL DEFAULT '[]',
    rows            JSONB NOT NULL DEFAULT '[]',
    extracted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_sop_page_table UNIQUE(page_id, table_index)
);

COMMENT ON TABLE public.confluence_sop_data IS
    'Extracted SOP table data from Confluence pages. Page ID 1256152285 = PWAO SOP.';

-- ============================================================================
-- STEP 2: TEMPLATES DATA STORAGE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.confluence_templates (
    id              BIGSERIAL PRIMARY KEY,
    page_id         BIGINT NOT NULL,
    page_title      TEXT NOT NULL,
    table_index     INTEGER NOT NULL DEFAULT 0,
    table_title     TEXT,
    template_use_case TEXT,
    applicable_sops  TEXT[],
    english_text    TEXT,
    mandarin_text   TEXT,
    location_color  TEXT,
    is_na_specific  BOOLEAN DEFAULT FALSE,
    is_eu_specific  BOOLEAN DEFAULT FALSE,
    is_global       BOOLEAN DEFAULT FALSE,
    headers         JSONB NOT NULL DEFAULT '[]',
    rows            JSONB NOT NULL DEFAULT '[]',
    extracted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_template_page_table UNIQUE(page_id, table_index)
);

COMMENT ON TABLE public.confluence_templates IS
    'Extracted Templates/Canned Responses from Confluence. Page ID 1256153038.';

-- ============================================================================
-- STEP 3: CHANGE LOG ENTRIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.confluence_changelog_entries (
    id                  BIGSERIAL PRIMARY KEY,
    page_id             BIGINT NOT NULL,
    page_title          TEXT NOT NULL,
    page_url            TEXT,
    change_number       INTEGER,
    date_added          DATE,
    effective_date      DATE,
    qc_impact_date     DATE,
    who_affects        TEXT,
    applicable_sop     TEXT,
    what_changing       TEXT,
    reason_change      TEXT,
    extracted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_changelog_entry UNIQUE(page_id, change_number)
);

COMMENT ON TABLE public.confluence_changelog_entries IS
    'Individual change log entries extracted from Change Log pages.';

-- ============================================================================
-- STEP 4: INDEXES FOR PERFORMANCE
-- ============================================================================

-- SOP data indexes
CREATE INDEX IF NOT EXISTS idx_sop_data_page_id
    ON public.confluence_sop_data (page_id);

CREATE INDEX IF NOT EXISTS idx_sop_data_table_index
    ON public.confluence_sop_data (table_index);

-- Template data indexes
CREATE INDEX IF NOT EXISTS idx_templates_page_id
    ON public.confluence_templates (page_id);

CREATE INDEX IF NOT EXISTS idx_templates_table_index
    ON public.confluence_templates (table_index);

CREATE INDEX IF NOT EXISTS idx_templates_english_text
    ON public.confluence_templates USING gin(to_tsvector('english', coalesce(english_text, '')));

CREATE INDEX IF NOT EXISTS idx_templates_mandarin_text
    ON public.confluence_templates USING gin(to_tsvector('english', coalesce(mandarin_text, '')));

-- Change log indexes
CREATE INDEX IF NOT EXISTS idx_changelog_page_id
    ON public.confluence_changelog_entries (page_id);

CREATE INDEX IF NOT EXISTS idx_changelog_date
    ON public.confluence_changelog_entries (date_added DESC);

CREATE INDEX IF NOT EXISTS idx_changelog_change_number
    ON public.confluence_changelog_entries (page_id, change_number);

-- ============================================================================
-- STEP 5: FUNCTIONS FOR DATA MANAGEMENT
-- ============================================================================

-- Function to upsert SOP data
CREATE OR REPLACE FUNCTION public.upsert_sop_data(
    p_page_id         BIGINT,
    p_page_title      TEXT,
    p_table_index     INTEGER,
    p_table_title     TEXT,
    p_headers         JSONB,
    p_rows            JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id BIGINT;
BEGIN
    INSERT INTO public.confluence_sop_data (
        page_id, page_title, table_index, table_title, headers, rows, updated_at
    ) VALUES (
        p_page_id, p_page_title, p_table_index, p_table_title, p_headers, p_rows, NOW()
    )
    ON CONFLICT (page_id, table_index) DO UPDATE SET
        page_title = EXCLUDED.page_title,
        table_title = EXCLUDED.table_title,
        headers = EXCLUDED.headers,
        rows = EXCLUDED.rows,
        updated_at = NOW()
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$;

-- Function to upsert template data
CREATE OR REPLACE FUNCTION public.upsert_template_data(
    p_page_id         BIGINT,
    p_page_title      TEXT,
    p_table_index     INTEGER,
    p_table_title     TEXT,
    p_template_use_case TEXT,
    p_applicable_sops  TEXT[],
    p_english_text    TEXT,
    p_mandarin_text   TEXT,
    p_location_color  TEXT,
    p_is_na_specific  BOOLEAN,
    p_is_eu_specific  BOOLEAN,
    p_is_global       BOOLEAN,
    p_headers         JSONB,
    p_rows            JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id BIGINT;
BEGIN
    INSERT INTO public.confluence_templates (
        page_id, page_title, table_index, table_title,
        template_use_case, applicable_sops, english_text, mandarin_text,
        location_color, is_na_specific, is_eu_specific, is_global,
        headers, rows, updated_at
    ) VALUES (
        p_page_id, p_page_title, p_table_index, p_table_title,
        p_template_use_case, p_applicable_sops, p_english_text, p_mandarin_text,
        p_location_color, p_is_na_specific, p_is_eu_specific, p_is_global,
        p_headers, p_rows, NOW()
    )
    ON CONFLICT (page_id, table_index) DO UPDATE SET
        page_title = EXCLUDED.page_title,
        table_title = EXCLUDED.table_title,
        template_use_case = EXCLUDED.template_use_case,
        applicable_sops = EXCLUDED.applicable_sops,
        english_text = EXCLUDED.english_text,
        mandarin_text = EXCLUDED.mandarin_text,
        location_color = EXCLUDED.location_color,
        is_na_specific = EXCLUDED.is_na_specific,
        is_eu_specific = EXCLUDED.is_eu_specific,
        is_global = EXCLUDED.is_global,
        headers = EXCLUDED.headers,
        rows = EXCLUDED.rows,
        updated_at = NOW()
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$;

-- Function to upsert change log entry
CREATE OR REPLACE FUNCTION public.upsert_changelog_entry(
    p_page_id         BIGINT,
    p_page_title      TEXT,
    p_page_url        TEXT,
    p_change_number   INTEGER,
    p_date_added      DATE,
    p_effective_date  DATE,
    p_qc_impact_date  DATE,
    p_who_affects     TEXT,
    p_applicable_sop  TEXT,
    p_what_changing   TEXT,
    p_reason_change   TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id BIGINT;
BEGIN
    INSERT INTO public.confluence_changelog_entries (
        page_id, page_title, page_url, change_number,
        date_added, effective_date, qc_impact_date,
        who_affects, applicable_sop, what_changing, reason_change,
        updated_at
    ) VALUES (
        p_page_id, p_page_title, p_page_url, p_change_number,
        p_date_added, p_effective_date, p_qc_impact_date,
        p_who_affects, p_applicable_sop, p_what_changing, p_reason_change,
        NOW()
    )
    ON CONFLICT (page_id, change_number) DO UPDATE SET
        page_title = EXCLUDED.page_title,
        page_url = EXCLUDED.page_url,
        effective_date = EXCLUDED.effective_date,
        qc_impact_date = EXCLUDED.qc_impact_date,
        who_affects = EXCLUDED.who_affects,
        applicable_sop = EXCLUDED.applicable_sop,
        what_changing = EXCLUDED.what_changing,
        reason_change = EXCLUDED.reason_change,
        updated_at = NOW()
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$;

-- ============================================================================
-- STEP 6: VIEWS FOR DASHBOARD
-- ============================================================================

-- View: All templates with searchable fields
CREATE OR REPLACE VIEW public.v_templates_searchable AS
SELECT 
    t.id,
    t.page_id,
    t.page_title,
    t.table_index,
    t.table_title,
    t.template_use_case,
    t.applicable_sops,
    t.english_text,
    t.mandarin_text,
    t.location_color,
    t.is_na_specific,
    t.is_eu_specific,
    t.is_global,
    t.extracted_at,
    t.updated_at,
    -- Searchable text for full-text search
    COALESCE(t.template_use_case, '') || ' ' || 
    COALESCE(t.english_text, '') || ' ' ||
    COALESCE(t.mandarin_text, '') || ' ' ||
    COALESCE(ARRAY_TO_STRING(t.applicable_sops, ' '), '') as search_text
FROM public.confluence_templates t;

-- View: Recent SOP updates
CREATE OR REPLACE VIEW public.v_sop_recent_updates AS
SELECT 
    page_id,
    page_title,
    table_index,
    table_title,
    updated_at
FROM public.confluence_sop_data
ORDER BY updated_at DESC;

-- View: Recent change logs
CREATE OR REPLACE VIEW public.v_changelog_recent AS
SELECT 
    id,
    page_id,
    page_title,
    page_url,
    change_number,
    date_added,
    effective_date,
    qc_impact_date,
    who_affects,
    applicable_sop,
    what_changing,
    reason_change,
    extracted_at
FROM public.confluence_changelog_entries
ORDER BY date_added DESC NULLS LAST, change_number DESC;

-- ============================================================================
-- STEP 7: GRANT PERMISSIONS
-- ============================================================================

-- Allow anon and authenticated users to read
GRANT SELECT ON public.confluence_sop_data TO anon, authenticated;
GRANT SELECT ON public.confluence_templates TO anon, authenticated;
GRANT SELECT ON public.confluence_changelog_entries TO anon, authenticated;
GRANT SELECT ON public.v_templates_searchable TO anon, authenticated;
GRANT SELECT ON public.v_sop_recent_updates TO anon, authenticated;
GRANT SELECT ON public.v_changelog_recent TO anon, authenticated;

-- Functions are already security definer so they work with service role
GRANT EXECUTE ON FUNCTION public.upsert_sop_data TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_template_data TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_changelog_entry TO anon, authenticated;
