"""Rebuild deterministic text, DOCX, PDF, and scanned PDF test fixtures."""
from pathlib import Path
import fitz
from docx import Document
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

ROOT = Path(__file__).parent
lines = (ROOT / "sample-login.txt").read_text(encoding="utf-8").splitlines()
document = Document()
document.add_heading(lines[0], 0)
for line in lines[1:]:
    document.add_paragraph(line)
document.save(ROOT / "sample-login.docx")

styles = getSampleStyleSheet()
styles["Normal"].fontSize = 11
styles["Normal"].leading = 17
styles["Title"].textColor = colors.HexColor("#152b48")
story = [Paragraph(lines[0], styles["Title"]), Spacer(1, 14)]
for line in lines[1:]:
    story.extend([Paragraph(line, styles["Normal"]), Spacer(1, 12)])
SimpleDocTemplate(str(ROOT / "sample-login.pdf"), title=lines[0]).build(story)

with fitz.open(ROOT / "sample-login.pdf") as text_pdf:
    pixmap = text_pdf[0].get_pixmap(matrix=fitz.Matrix(1, 1))
    with fitz.open() as scanned:
        page = scanned.new_page(width=text_pdf[0].rect.width, height=text_pdf[0].rect.height)
        page.insert_image(page.rect, stream=pixmap.tobytes("png"))
        scanned.save(ROOT / "scanned.pdf")
    pixmap.save(ROOT / "sample-login-preview.png")
print("Generated sample-login.pdf, sample-login.docx, scanned.pdf")
