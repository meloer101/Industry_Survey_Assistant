from __future__ import annotations

from io import BytesIO
import re

from google.adk.tools import ToolContext
from pypdf import PdfReader
import requests


FED_FILES_BASE = "https://www.federalreserve.gov/monetarypolicy/files"
MAX_RETURN_CHARS = 8000
REQUEST_TIMEOUT = 30


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(pdf_bytes))
    pages: list[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        if text.strip():
            pages.append(text)
    return "\n".join(pages)


def _clean_text(text: str) -> str:
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    cleaned: list[str] = []
    previous = ""
    for line in lines:
        if not line:
            continue
        if line == previous:
            continue
        if re.fullmatch(r"\d+", line):
            continue
        cleaned.append(line)
        previous = line
    return "\n".join(cleaned)


def _download_pdf(url: str) -> tuple[int, bytes]:
    response = requests.get(url, timeout=REQUEST_TIMEOUT)
    if response.status_code != 200:
        return response.status_code, b""
    return response.status_code, response.content


def _candidate_urls(year: int, month: int) -> list[str]:
    urls = [f"{FED_FILES_BASE}/FOMC{year}{month:02d}meeting.pdf"]
    urls.extend(
        f"{FED_FILES_BASE}/fomcminutes{year}{month:02d}{day:02d}.pdf"
        for day in range(31, 0, -1)
    )
    return urls


def fetch_fomc_transcript(year: int, month: int, tool_context: ToolContext) -> str:
    """Fetch and return FOMC transcript or minutes text for a year/month."""
    if month < 1 or month > 12:
        return f"Invalid FOMC meeting month: {month}"

    last_status = None
    try:
        for url in _candidate_urls(year, month):
            status, content = _download_pdf(url)
            last_status = status
            if status == 404:
                continue
            if status != 200:
                continue

            text = _clean_text(_extract_pdf_text(content))
            if not text:
                return f"Could not extract text from PDF: {url}"

            total_chars = len(text)
            excerpt = text[:MAX_RETURN_CHARS]
            suffix = f"\n\n[Source: {url}; total characters: {total_chars}; showing first {len(excerpt)}]"
            return excerpt + suffix
    except requests.Timeout:
        return "Timeout fetching transcript. Try again or use a different date."
    except Exception as exc:
        return f"Error fetching transcript for {year}-{month:02d}: {exc}"

    if last_status == 404 or last_status is None:
        return f"No FOMC transcript found for {year}-{month:02d}"
    return f"No FOMC transcript found for {year}-{month:02d} (last HTTP status: {last_status})"
