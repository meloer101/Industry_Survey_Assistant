from __future__ import annotations

from io import BytesIO
import difflib
import re

from google.adk.tools import ToolContext
from pypdf import PdfReader
import requests


MAX_PDF_BYTES = 5 * 1024 * 1024
MAX_DIFF_LINES = 200
REQUEST_TIMEOUT = 30


def _download_pdf(url: str) -> bytes | str:
    response = requests.get(url, timeout=REQUEST_TIMEOUT, stream=True)
    if response.status_code != 200:
        return f"Could not download PDF: {url} (HTTP {response.status_code})"

    content_length = response.headers.get("content-length")
    if content_length and int(content_length) > MAX_PDF_BYTES:
        return f"PDF exceeds 5MB limit: {url}"

    chunks: list[bytes] = []
    total = 0
    for chunk in response.iter_content(chunk_size=64 * 1024):
        if not chunk:
            continue
        total += len(chunk)
        if total > MAX_PDF_BYTES:
            return f"PDF exceeds 5MB limit: {url}"
        chunks.append(chunk)
    return b"".join(chunks)


def _extract_pdf_text(pdf_bytes: bytes, url: str) -> str:
    reader = PdfReader(BytesIO(pdf_bytes))
    text = "\n".join((page.extract_text() or "") for page in reader.pages).strip()
    if not text:
        return f"Could not extract text from PDF: {url}"
    return text


def _split_for_diff(text: str) -> list[str]:
    compact = re.sub(r"[ \t]+", " ", text)
    compact = re.sub(r"\n{2,}", "\n", compact)
    chunks = re.split(r"(?<=[.!?])\s+|\n+", compact)
    return [chunk.strip() for chunk in chunks if chunk.strip()]


def compare_fed_statements(url1: str, url2: str, tool_context: ToolContext) -> str:
    """Download two Fed statement PDFs and return a unified text diff."""
    try:
        first_pdf = _download_pdf(url1)
        if isinstance(first_pdf, str):
            return first_pdf
        second_pdf = _download_pdf(url2)
        if isinstance(second_pdf, str):
            return second_pdf

        first_text = _extract_pdf_text(first_pdf, url1)
        if first_text.startswith("Could not extract text"):
            return first_text
        second_text = _extract_pdf_text(second_pdf, url2)
        if second_text.startswith("Could not extract text"):
            return second_text
    except requests.Timeout:
        return "Timeout downloading FOMC statement PDFs. Try again later."
    except Exception as exc:
        return f"Error comparing Fed statements: {exc}"

    diff_lines = list(
        difflib.unified_diff(
            _split_for_diff(first_text),
            _split_for_diff(second_text),
            fromfile=url1,
            tofile=url2,
            lineterm="",
        )
    )
    if not diff_lines:
        return "No textual differences found between the two statements."

    truncated = diff_lines[:MAX_DIFF_LINES]
    result = "\n".join(truncated)
    if len(diff_lines) > MAX_DIFF_LINES:
        result += "\n[truncated - showing first 200 diff lines]"
    return result
