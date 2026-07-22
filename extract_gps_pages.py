#!/usr/bin/env python3
"""
Extract GPS pages from Confluence and export to various formats.
Usage: python extract_gps_pages.py
"""

import os
import sys
import json
import csv
import hashlib
import base64
import urllib.parse
import re
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional
import logging

import requests
from bs4 import BeautifulSoup

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("extract_gps_pages")

# ============================================================================
# Config
# ============================================================================
CONFLUENCE_BASE = "https://wayfaircorp.atlassian.net"
CONFLUENCE_API = f"{CONFLUENCE_BASE}/wiki/rest/api"
SPACE_KEY = "GPS"

# Target pages
TARGET_PAGES = {
    1256184469: {"title": "SOP DSC2S", "filename": "sop_dsc2s"},
    1256148486: {"title": "Change Log DSC2S", "filename": "change_log_dsc2s"},
    1256148684: {"title": "Canned Responses Templates", "filename": "canned_responses_dsc2s"},
}

# Output directory
OUTPUT_DIR = Path("extracted_data")
OUTPUT_DIR.mkdir(exist_ok=True)


# ============================================================================
# Dataclasses
# ============================================================================
@dataclass
class ConfluencePage:
    id: int
    title: str
    version_number: int
    version_when: Optional[str]
    version_by_name: Optional[str]
    body_content: str
    labels: list
    parent_id: Optional[int]
    space_key: str = SPACE_KEY


# ============================================================================
# Confluence Client
# ============================================================================
class ConfluenceClient:
    """Lightweight Confluence REST API client."""

    def __init__(self, email: str, api_key: str):
        self.session = requests.Session()
        self.session.auth = (email, api_key)
        self.session.headers.update({
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "dashboard-f1-extractor/1.0",
        })
        self.api_root = f"{CONFLUENCE_BASE}/wiki/rest/api"

    def get_current_user(self) -> dict:
        return self._get("/user/current")

    def get_page(self, page_id: int, *, expand: str = "version,body.storage,metadata.labels,history") -> ConfluencePage:
        data = self._get(f"/content/{page_id}", params={"expand": expand})
        return self._parse_page(data)

    def _get(self, path: str, params: dict = None) -> dict:
        url = f"{self.api_root}{path}"
        for attempt in range(1, 4):
            try:
                resp = self.session.get(url, params=params, timeout=30)
                resp.raise_for_status()
                return resp.json()
            except requests.RequestException as exc:
                log.warning("Attempt %d/%d failed: %s", attempt, 3, exc)
                if attempt == 3:
                    raise
        return {}

    @staticmethod
    def _parse_page(data: dict) -> ConfluencePage:
        ver = data.get("version", {})
        ver_number = int(ver.get("number", 0) or 0)
        ver_when = ver.get("when")
        ver_by_name = ver.get("by", {}).get("displayName")

        body_content = data.get("body", {}).get("storage", {}).get("value", "")

        labels = []
        for lbl in data.get("metadata", {}).get("labels", {}).get("results", []):
            if lbl.get("name"):
                labels.append(lbl["name"])

        parent_id = data.get("history", {}).get("parentId")

        return ConfluencePage(
            id=int(data["id"]),
            title=data.get("title", ""),
            version_number=ver_number,
            version_when=ver_when,
            version_by_name=ver_by_name,
            body_content=body_content,
            labels=labels,
            parent_id=parent_id,
            space_key=data.get("space", {}).get("key", SPACE_KEY),
        )


# ============================================================================
# HTML Parsing & Table Extraction
# ============================================================================
def clean_html(html: str) -> str:
    """Remove Confluence-specific elements and clean HTML."""
    soup = BeautifulSoup(html, "html.parser")
    
    # Remove script tags
    for script in soup.find_all("script"):
        script.decompose()
    
    # Remove iframe placeholders (Refined Wiki macros)
    for iframe in soup.find_all("iframe"):
        iframe.decompose()
    
    # Remove ap-container divs (macro containers)
    for ap in soup.find_all("div", class_="ap-container"):
        ap.decompose()
    
    # Remove macro blocks
    for macro in soup.find_all("div", class_=re.compile(r"conf-macro|ap-")):
        macro.decompose()
    
    return str(soup)


def extract_tables_from_html(html: str) -> list:
    """Extract all tables from HTML and return as list of dicts."""
    soup = BeautifulSoup(html, "html.parser")
    tables_data = []
    
    for idx, table in enumerate(soup.find_all("table")):
        table_info = {"index": idx, "headers": [], "rows": []}
        
        # Get headers
        headers = []
        header_row = table.find("tr")
        if header_row:
            for th in header_row.find_all(["th", "td"]):
                header_text = th.get_text(strip=True)
                if not header_text:
                    header_text = f"Column_{len(headers) + 1}"
                headers.append(header_text)
        
        if not headers:
            # Try first row as header
            first_row = table.find("tr")
            if first_row:
                for cell in first_row.find_all(["th", "td"]):
                    headers.append(cell.get_text(strip=True) or f"Column_{len(headers) + 1}")
        
        table_info["headers"] = headers
        
        # Get rows (skip header row)
        rows = table.find_all("tr")[1:] if table.find_all("tr") else []
        for row in rows:
            cells = row.find_all(["td", "th"])
            row_data = [cell.get_text(strip=True) for cell in cells]
            if any(row_data):  # Skip empty rows
                table_info["rows"].append(row_data)
        
        if table_info["rows"]:
            tables_data.append(table_info)
    
    return tables_data


def extract_lists_from_html(html: str) -> list:
    """Extract ordered and unordered lists."""
    soup = BeautifulSoup(html, "html.parser")
    lists_data = []
    
    for ul in soup.find_all(["ul", "ol"]):
        items = []
        for li in ul.find_all("li"):
            text = li.get_text(strip=True)
            if text:
                items.append(text)
        if items:
            lists_data.append({"type": ul.name, "items": items})
    
    return lists_data


def extract_headings_and_content(html: str) -> list:
    """Extract headings with their content."""
    soup = BeautifulSoup(html, "html.parser")
    content_sections = []
    
    for tag in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]):
        section = {
            "level": int(tag.name[1]),
            "text": tag.get_text(strip=True),
            "id": tag.get("id", ""),
        }
        
        # Get next sibling content until next heading
        next_elem = tag.find_next_sibling()
        content_parts = []
        while next_elem and next_elem.name not in ["h1", "h2", "h3", "h4", "h5", "h6"]:
            if next_elem.name == "p":
                text = next_elem.get_text(strip=True)
                if text:
                    content_parts.append(text)
            elif next_elem.name in ["ul", "ol"]:
                for li in next_elem.find_all("li"):
                    text = li.get_text(strip=True)
                    if text:
                        content_parts.append(f"• {text}")
            elif next_elem.name == "table":
                break  # Tables handled separately
            next_elem = next_elem.find_next_sibling()
        
        section["content"] = " ".join(content_parts) if content_parts else ""
        content_sections.append(section)
    
    return content_sections


# ============================================================================
# Refined Wiki Macro Parser
# ============================================================================
def decode_jwt_payload(token: str) -> Optional[dict]:
    """Decode JWT payload (without verification)."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload = parts[1]
        # Add padding if needed
        payload += "=" * (4 - len(payload) % 4) if len(payload) % 4 else ""
        decoded = base64.b64decode(payload)
        return json.loads(decoded)
    except Exception:
        return None


def extract_macro_urls(html: str) -> list:
    """Extract dynamic macro content URLs from HTML."""
    soup = BeautifulSoup(html, "html.parser")
    macros = []
    
    for script in soup.find_all("script", class_="ap-iframe-body-script"):
        try:
            # Extract JSON data from script
            script_text = script.string
            if script_text and '"url"' in script_text:
                # Find the data object
                match = re.search(r'"url"\s*:\s*"([^"]+)"', script_text)
                if match:
                    url = match.group(1)
                    if "refined-toolkit" in url or "dynamic-macros" in url:
                        macros.append(url)
        except Exception:
            continue
    
    return macros


# ============================================================================
# Export Functions
# ============================================================================
def export_to_csv(tables: list, output_path: Path, sheet_name: str = "Sheet1"):
    """Export tables to CSV (single table per file for clarity)."""
    if not tables:
        log.warning("No tables found to export to CSV")
        return False
    
    # For single table, export directly
    if len(tables) == 1:
        table = tables[0]
        with open(output_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(table["headers"])
            writer.writerows(table["rows"])
        log.info(f"Exported CSV: {output_path}")
        return True
    
    # For multiple tables, create separate files
    for idx, table in enumerate(tables):
        if len(tables) > 1:
            table_path = output_path.parent / f"{output_path.stem}_table_{idx + 1}.csv"
        else:
            table_path = output_path
        
        with open(table_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(table["headers"])
            writer.writerows(table["rows"])
        log.info(f"Exported CSV: {table_path}")
    
    return True


def export_to_json(data: dict, output_path: Path):
    """Export all data to JSON."""
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    log.info(f"Exported JSON: {output_path}")


def export_to_markdown(page: ConfluencePage, tables: list, sections: list, output_path: Path):
    """Export to Markdown format."""
    lines = [
        f"# {page.title}",
        "",
        f"**Page ID:** {page.id}",
        f"**Version:** {page.version_number}",
        f"**Last Updated:** {page.version_when}",
        f"**Updated By:** {page.version_by_name}",
        f"**Space:** {page.space_key}",
        "",
        "---",
        "",
    ]
    
    # Headings and content
    if sections:
        lines.append("## Content Sections")
        lines.append("")
        for section in sections:
            indent = "  " * (section["level"] - 1)
            lines.append(f"{indent}### {section['text']}" if section["level"] == 1 else f"{indent}#### {section['text']}" if section["level"] == 2 else f"{indent}**{section['text']}**")
            if section["content"]:
                lines.append("")
                lines.append(f"{indent}{section['content']}")
            lines.append("")
    
    # Tables
    for idx, table in enumerate(tables):
        lines.append(f"## Table {idx + 1}")
        lines.append("")
        
        if table["headers"]:
            lines.append("| " + " | ".join(table["headers"]) + " |")
            lines.append("| " + " | ".join(["---"] * len(table["headers"])) + " |")
        
        for row in table["rows"]:
            lines.append("| " + " | ".join(str(cell) for cell in row) + " |")
        lines.append("")
    
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    log.info(f"Exported Markdown: {output_path}")


def export_to_html(page: ConfluencePage, tables: list, sections: list, output_path: Path):
    """Export to HTML format with styling."""
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{page.title}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }}
        h1 {{ color: #172B4D; border-bottom: 2px solid #0052CC; padding-bottom: 10px; }}
        h2 {{ color: #0052CC; margin-top: 30px; }}
        .meta {{ background: #F4F5F7; padding: 15px; border-radius: 5px; margin-bottom: 20px; }}
        .meta span {{ margin-right: 20px; }}
        table {{ border-collapse: collapse; width: 100%; margin: 20px 0; }}
        th {{ background: #0052CC; color: white; padding: 12px; text-align: left; }}
        td {{ border: 1px solid #DFE1E6; padding: 10px; }}
        tr:nth-child(even) {{ background: #F4F5F7; }}
        .section {{ margin: 20px 0; padding: 15px; background: #FAFBFC; border-left: 4px solid #0052CC; }}
        .footer {{ margin-top: 40px; padding-top: 20px; border-top: 1px solid #DFE1E6; color: #6B778C; font-size: 12px; }}
    </style>
</head>
<body>
    <h1>{page.title}</h1>
    
    <div class="meta">
        <span><strong>Page ID:</strong> {page.id}</span>
        <span><strong>Version:</strong> {page.version_number}</span>
        <span><strong>Updated:</strong> {page.version_when or 'N/A'}</span>
        <span><strong>By:</strong> {page.version_by_name or 'N/A'}</span>
    </div>
"""
    
    # Content sections
    if sections:
        html += "    <h2>Content</h2>\n"
        for section in sections:
            if section["level"] <= 3:
                tag = f"h{section['level'] + 1}"
                html += f"    <div class='section'>\n"
                html += f"        <{tag}>{section['text']}</{tag}>\n"
                if section["content"]:
                    html += f"        <p>{section['content']}</p>\n"
                html += "    </div>\n"
    
    # Tables
    for idx, table in enumerate(tables):
        html += f"    <h2>Table {idx + 1}</h2>\n"
        html += "    <table>\n"
        
        if table["headers"]:
            html += "        <thead><tr>\n"
            for header in table["headers"]:
                html += f"            <th>{header}</th>\n"
            html += "        </tr></thead>\n"
        
        html += "        <tbody>\n"
        for row in table["rows"]:
            html += "            <tr>\n"
            for cell in row:
                html += f"                <td>{cell}</td>\n"
            html += "            </tr>\n"
        html += "        </tbody>\n"
        html += "    </table>\n"
    
    html += f"""
    <div class="footer">
        <p>Exported from Confluence | Space: {page.space_key} | Generated: {datetime.now().isoformat()}</p>
        <p>URL: {CONFLUENCE_BASE}/wiki/spaces/{page.space_key}/pages/{page.id}</p>
    </div>
</body>
</html>"""
    
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    log.info(f"Exported HTML: {output_path}")


# ============================================================================
# Main
# ============================================================================
def get_credentials():
    """Get Confluence credentials from environment or prompt."""
    email = os.environ.get("CONFLUENCE_EMAIL")
    api_key = os.environ.get("CONFLUENCE_API_KEY")
    
    # For testing, check if credentials are in environment
    if not email:
        # Try to read from test files or use default
        log.warning("CONFLUENCE_EMAIL not set in environment")
        email = input("Enter Confluence email: ").strip()
    
    if not api_key:
        log.warning("CONFLUENCE_API_KEY not set in environment")
        api_key = input("Enter Confluence API key: ").strip()
    
    return email, api_key


def main():
    print("=" * 60)
    print("  Confluence GPS Pages Extractor")
    print("=" * 60)
    
    # Get credentials
    email = os.environ.get("CONFLUENCE_EMAIL")
    api_key = os.environ.get("CONFLUENCE_API_KEY")
    
    if not email or not api_key:
        log.error("CONFLUENCE_EMAIL and CONFLUENCE_API_KEY must be set in environment")
        sys.exit(1)
    
    # Initialize client
    try:
        client = ConfluenceClient(email, api_key)
        user = client.get_current_user()
        log.info(f"Connected as: {user.get('displayName', 'Unknown')}")
    except Exception as exc:
        log.error(f"Failed to connect: {exc}")
        sys.exit(1)
    
    # Process each page
    all_data = {"extracted_at": datetime.now().isoformat(), "pages": []}
    
    for page_id, page_info in TARGET_PAGES.items():
        log.info(f"\n{'=' * 40}")
        log.info(f"Fetching: {page_info['title']} (ID: {page_id})")
        log.info(f"{'=' * 40}")
        
        try:
            page = client.get_page(page_id)
        except Exception as exc:
            log.error(f"Failed to fetch page {page_id}: {exc}")
            continue
        
        log.info(f"Title: {page.title}")
        log.info(f"Version: {page.version_number}")
        
        # Extract data from HTML
        cleaned_html = clean_html(page.body_content)
        tables = extract_tables_from_html(cleaned_html)
        sections = extract_headings_and_content(cleaned_html)
        
        log.info(f"Found {len(tables)} table(s) and {len(sections)} section(s)")
        
        # Prepare page data
        page_data = {
            "id": page.id,
            "title": page.title,
            "version": page.version_number,
            "updated": page.version_when,
            "updated_by": page.version_by_name,
            "tables": tables,
            "sections": sections,
            "table_count": len(tables),
            "row_count": sum(len(t["rows"]) for t in tables),
        }
        all_data["pages"].append(page_data)
        
        # Export files
        base_filename = page_info["filename"]
        
        # JSON - all data for this page
        json_path = OUTPUT_DIR / f"{base_filename}.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(page_data, f, indent=2, ensure_ascii=False)
        log.info(f"Exported: {json_path}")
        
        # CSV - first/largest table
        if tables:
            # Find largest table
            largest_table = max(tables, key=lambda t: len(t["rows"]))
            csv_path = OUTPUT_DIR / f"{base_filename}.csv"
            export_to_csv([largest_table], csv_path)
        
        # Markdown
        md_path = OUTPUT_DIR / f"{base_filename}.md"
        export_to_markdown(page, tables, sections, md_path)
        
        # HTML
        html_path = OUTPUT_DIR / f"{base_filename}.html"
        export_to_html(page, tables, sections, html_path)
    
    # Save combined JSON
    all_json_path = OUTPUT_DIR / "all_pages_combined.json"
    with open(all_json_path, "w", encoding="utf-8") as f:
        json.dump(all_data, f, indent=2, ensure_ascii=False)
    log.info(f"\nExported combined JSON: {all_json_path}")
    
    # Summary
    print("\n" + "=" * 60)
    print("  Extraction Complete!")
    print("=" * 60)
    print(f"\nOutput directory: {OUTPUT_DIR.absolute()}")
    print("\nFiles created:")
    for f in sorted(OUTPUT_DIR.iterdir()):
        size = f.stat().st_size
        print(f"  - {f.name} ({size:,} bytes)")
    print()


if __name__ == "__main__":
    main()
