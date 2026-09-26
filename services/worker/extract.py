"""Extract source text as data, preserving page and paragraph references."""
import json
import re
import sys
import zipfile
from pathlib import Path

import fitz
from docx import Document


class InputError(Exception):
    pass


def normalize(text):
    return re.sub(r"\s+", " ", text).strip()


def extract(path, mime):
    blocks = []
    warnings = []
    page_count = None

    if mime == "application/pdf":
        with fitz.open(path) as document:
            if document.is_encrypted:
                raise InputError("Password-protected PDFs are unsupported. Upload an unlocked text PDF.")
            page_count = len(document)
            if page_count > 1000:
                raise InputError("PDF exceeds 1,000 pages. Split it into smaller documents.")
            for page_number, page in enumerate(document, 1):
                page_blocks = sorted(page.get_text("blocks"), key=lambda block: (block[1], block[0]))
                paragraphs = []
                previous = None
                for block in page_blocks:
                    if len(block) <= 6 or block[6] != 0:
                        continue
                    text = normalize(block[4])
                    if not text:
                        continue
                    # PDF text blocks can split one wrapped clause into several lines.
                    # Join adjacent aligned continuation lines, keeping the first locator.
                    continuation = (
                        previous is not None and paragraphs
                        and not re.match(r"^(?:\d+[.)]|[-•])\s", text)
                        and abs(block[0] - previous[0]) < 12
                        and block[1] - previous[3] <= max(4, (previous[3] - previous[1]) * 0.6)
                        and not re.search(r"[.!?:]$", paragraphs[-1])
                    )
                    if continuation:
                        paragraphs[-1] += " " + text
                    else:
                        paragraphs.append(text)
                    previous = block
                if not paragraphs:
                    warnings.append(f"Page {page_number} has no extractable text. OCR is unsupported; upload a text PDF, DOCX, or TXT.")
                for paragraph, text in enumerate(paragraphs, 1):
                    blocks.append({"text": text, "locator": {"page": page_number, "paragraph": paragraph}})
    elif mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        with zipfile.ZipFile(path) as archive:
            if len(archive.infolist()) > 2000 or sum(item.file_size for item in archive.infolist()) > 50 * 1024 * 1024:
                raise InputError("DOCX exceeds safe processing limits. Split it into smaller documents.")
        document = Document(path)
        # Paragraph indices are stable within the document's reading order.
        from docx.table import Table
        from docx.text.paragraph import Paragraph
        paragraph = 0
        for item in document.iter_inner_content():
            if isinstance(item, Paragraph):
                paragraph += 1
                text = normalize(item.text)
                if text:
                    blocks.append({"text": text, "locator": {"paragraph": paragraph}})
            elif isinstance(item, Table):
                for row in item.rows:
                    paragraph += 1
                    text = normalize(" | ".join(cell.text for cell in row.cells))
                    if text:
                        blocks.append({"text": text, "locator": {"paragraph": paragraph}})
    elif mime == "text/plain":
        raw = Path(path).read_text(encoding="utf-8-sig", errors="strict")
        if "\x00" in raw:
            raise InputError("TXT files must contain UTF-8 text, not binary data.")
        for paragraph, line in enumerate(raw.splitlines(), 1):
            text = normalize(line)
            if text:
                blocks.append({"text": text, "locator": {"paragraph": paragraph}})
    else:
        raise InputError("Unsupported source type. Upload PDF, DOCX, or UTF-8 TXT.")

    offset = 0
    for block in blocks:
        block["offset"] = offset
        block.update(block["locator"])
        offset += len(block["text"]) + 1
    text = "\n".join(block["text"] for block in blocks)
    if len(text) > 500_000:
        raise InputError("Extracted text exceeds 500,000 characters. Split the document into smaller files.")
    if not text and not warnings:
        warnings.append("No readable text found. Upload a document containing requirement text.")
    return {"text": text, "pageMap": blocks, "pageCount": page_count, "warnings": warnings}


if __name__ == "__main__":
    try:
        result = extract(sys.argv[1], sys.argv[2])
        print(json.dumps(result, ensure_ascii=True))
    except Exception as error:
        # Never print source text, paths, document contents, or Python internals.
        safe = str(error) if isinstance(error, InputError) else "The document could not be parsed. Check that it is a valid, unlocked file."
        if isinstance(error, UnicodeError):
            safe = "TXT files must use UTF-8 encoding. Save as UTF-8 and retry."
        print(json.dumps({"error": safe[:300]}))
        sys.exit(1)
