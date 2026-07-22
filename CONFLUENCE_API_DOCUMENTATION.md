# Confluence API Integration Guide

## Overview

This project integrates with Atlassian Confluence (wayfaircorp.atlassian.net) to monitor and sync documentation pages from the **GPS (Global Partner Retail Enablement)** space.

## Confluence Instance

| Property | Value |
|----------|-------|
| Base URL | `https://wayfaircorp.atlassian.net` |
| Wiki Domain | `wayfaircorp.atlassian.net/wiki` |
| User Email | `lle31@wayfair.com` |
| API Key | `ATATT3xFfGF0MylzpU43ITGrELXebo0zEdBvAdsWRWn4_M5ItRNHW_q6voY4YZbzwBURgN1od6o55TlXaCzI5Tf7hrdSkdIfhYCJEwpyN3bZ_aCrTG5caT7CNP4mnPqUpSNcNtcUvZGPzN3_s9sEet_jjxTfVYM-VPm1Gfn3Ob6SEI-G3QmC4AI=53EFE2CE` |

## Target Space

| Property | Value |
|----------|-------|
| Space Key | `GPS` |
| Space Name | Global Partner Retail Enablement |

## Key Pages to Monitor

| Page ID | Page Title | Version | Last Modified |
|---------|------------|---------|---------------|
| `1256185536` | Order to Delivery Journey - VCN | v2 | 2024-07-01T17:38:07.573Z |

## Authentication

Confluence uses **email + API token** authentication. The library used is [`atlassian-python-api`](https://atlassian-python-api.readthedocs.io/).

### Python Setup

```bash
# Install dependency
pip install atlassian-python-api>=3.0.0
```

### Authentication Code

```python
from atlassian import Confluence

confluence = Confluence(
    url="https://wayfaircorp.atlassian.net",
    username="lle31@wayfair.com",
    password="YOUR_API_KEY_HERE",
    cloud=True,
)
```

## Available API Operations

### 1. Get Current User
```python
user = confluence.get('/rest/api/user/current')
# Returns: {"accountId": "...", "displayName": "Lam Le", "email": "lle31@wayfair.com"}
```

### 2. Get Space Info
```python
space = confluence.get_space("GPS")
# Returns: {"key": "GPS", "name": "Global Partner Retail Enablement", ...}
```

### 3. Get Page by ID
```python
page = confluence.get_page_by_id(
    "1256185536",
    expand="version,body.storage,metadata.labels"
)
# Returns: {id, title, version, body.storage.value, ...}
```

### 4. Get All Pages in Space
```python
pages = confluence.get_all_pages_from_space(
    space="GPS",
    expand="version",
    limit=100,
    content_type="page"
)
```

### 5. Get Page History
```python
history = confluence.get_page_history("1256185536")
```

## Testing the API Key

Run the test script to verify permissions:

```bash
python test_api_key.py
```

Expected output:
```
============================================================
  Confluence API Key Permission Test
  Target: https://wayfaircorp.atlassian.net/wiki/spaces/GPS
============================================================

✅ PASS | API Connection
      Connected as: Lam Le

✅ PASS | Space Access (GPS)
      Space name: Global Partner Retail Enablement

✅ PASS | Page Access (1256185536)
      Title: 'Order to Delivery Journey - VCN' (v2), Modified: 2024-07-01T17:38:07.573Z

✅ PASS | List Pages in GPS
      Found 10 pages (showing first 10)
      - 4 Walls (4W) (v149)
      ...

============================================================
  🎉 All tests passed! API key has full access.
============================================================
```

## Recommended GitHub Stack

### 1. Python Runtime
- **Python 3.10+** recommended
- Use virtual environment (`venv`) for dependency isolation

### 2. Dependencies
```
atlassian-python-api>=3.0.0
requests>=2.28.0
```

### 3. CI/CD Considerations
- Store API credentials in GitHub Secrets
- Example secret names:
  - `CONFLUENCE_EMAIL`
  - `CONFLUENCE_API_KEY`

### 4. Sample GitHub Actions Workflow

```yaml
name: Confluence Monitor

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours

jobs:
  check-updates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.10'
          
      - name: Install dependencies
        run: pip install -r requirements.txt
        
      - name: Run monitor
        env:
          CONFLUENCE_EMAIL: ${{ secrets.CONFLUENCE_EMAIL }}
          CONFLUENCE_API_KEY: ${{ secrets.CONFLUENCE_API_KEY }}
        run: python monitor.py
```

### 5. Environment Variables Pattern

```python
import os

CONFLUENCE_URL = os.getenv("CONFLUENCE_URL", "https://wayfaircorp.atlassian.net")
CONFLUENCE_EMAIL = os.getenv("CONFLUENCE_EMAIL")
CONFLUENCE_API_KEY = os.getenv("CONFLUENCE_API_KEY")
SPACE_KEY = os.getenv("CONFLUENCE_SPACE_KEY", "GPS")
```

## API Rate Limits

- Confluence Cloud has rate limits (~100 requests/minute for authenticated users)
- Implement exponential backoff for retries
- Cache responses when appropriate

## Troubleshooting

### Error: `'Confluence' object has no attribute`
The `atlassian-python-api` library API may have changed. Check version:
```bash
pip show atlassian-python-api
```

### Error: 401 Unauthorized
- Verify email and API key are correct
- API key format: starts with `ATATT...`

### Error: 403 Forbidden
- User may not have access to the space
- Contact Confluence admin to grant permissions

## Security Notes

1. **Never commit API keys** to version control
2. Use environment variables or secrets management
3. Rotate API keys periodically
4. Grant minimum required permissions

## Resources

- [Confluence REST API Documentation](https://docs.atlassian.com/confluence/REST/latest/)
- [atlassian-python-api Library](https://atlassian-python-api.readthedocs.io/)
- [Confluence API Reference](https://developer.atlassian.com/cloud/confluence/rest/intro/)
