#!/usr/bin/env python3
"""
PDF -> paper JSON (semi-auto)

Usage example:
python scripts/pdf_to_paper.py \
  --pdf "C:\\Users\\my\\Downloads\\2025年6月英语六级真题(第1套).pdf" \
  --paper-id "cet6-2025-06-set1" \
  --exam "六级" \
  --year 2025 \
  --month 6 \
  --set 1

Dependencies:
  pip install pypdf cryptography
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader


@dataclass
class PaperMeta:
  paper_id: str
  exam: str
  year: int
  month: int
  set_no: int


def normalize_spaces(text: str) -> str:
  lines = []
  for raw in text.splitlines():
    line = raw.strip()
    if not line:
      lines.append("")
      continue
    # remove page header/footer noise
    if re.match(r"^\d+\s+https?://", line):
      continue
    if line.lower().startswith("https://"):
      continue
    # collapse excessive spaces
    line = re.sub(r"\s+", " ", line)
    lines.append(line)

  # collapse >2 empty lines into single empty line
  compact = []
  empty_streak = 0
  for line in lines:
    if line == "":
      empty_streak += 1
      if empty_streak <= 1:
        compact.append("")
      continue
    empty_streak = 0
    compact.append(line)

  return "\n".join(compact).strip()


def normalize_passage_text(text: str) -> str:
  """
  Merge hard line wraps from PDF into readable paragraphs.
  Keep blank-line paragraph boundaries.
  Also split option-style markers like 'A. ...', 'B. ...' into separate paragraphs.
  """
  lines = [line.strip() for line in text.splitlines()]
  paragraphs: list[str] = []
  buffer: list[str] = []

  def flush_buffer() -> None:
    if buffer:
      paragraphs.append(" ".join(buffer))
      buffer.clear()

  for line in lines:
    if not line:
      flush_buffer()
      continue

    # Start a new paragraph at option-like markers if a paragraph is already building.
    if re.match(r"^[A-Z]\.\s+", line) and buffer:
      flush_buffer()

    buffer.append(line)

  flush_buffer()
  normalized = "\n\n".join(paragraphs).strip()
  return rebalance_paragraphs(normalized)


def split_sentences(text: str) -> list[str]:
  # basic sentence splitter for readability formatting
  parts = re.split(r"(?<=[.!?])\s+(?=[A-Z\"“])", text.strip())
  return [p.strip() for p in parts if p.strip()]


def rebalance_paragraphs(text: str) -> str:
  """
  If a passage collapses into one huge paragraph after cleaning,
  split it into smaller readable paragraphs (every ~3 sentences).
  """
  if not text:
    return text

  paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

  def chunk_if_too_long(paragraph: str) -> list[str]:
    if len(paragraph) < 900:
      return [paragraph]
    sentences = split_sentences(paragraph)
    if len(sentences) < 6:
      return [paragraph]
    chunked_local = []
    step = 3
    for i in range(0, len(sentences), step):
      chunked_local.append(" ".join(sentences[i : i + step]))
    return chunked_local

  # Case 1: collapsed to one giant paragraph
  if len(paragraphs) == 1:
    return "\n\n".join(chunk_if_too_long(paragraphs[0]))

  # Case 2: has some paragraph breaks but still contains giant blocks
  rebuilt: list[str] = []
  changed = False
  for p in paragraphs:
    chunks = chunk_if_too_long(p)
    if len(chunks) > 1:
      changed = True
    rebuilt.extend(chunks)

  if changed:
    return "\n\n".join(rebuilt)
  return text


def read_pdf_text(pdf_path: Path) -> str:
  reader = PdfReader(str(pdf_path))
  if reader.is_encrypted:
    try:
      reader.decrypt("")
    except Exception:
      pass

  page_texts = []
  for page in reader.pages:
    txt = page.extract_text() or ""
    page_texts.append(txt)

  return normalize_spaces("\n\n".join(page_texts))


def find_idx(text: str, patterns: list[str]) -> int:
  for p in patterns:
    i = text.find(p)
    if i != -1:
      return i
  return -1


def get_reading_scope(text: str) -> str:
  reading_start = find_idx(
    text,
    [
      "Part III Reading Comprehension",
      "Part III",
      "Reading Comprehension",
    ],
  )
  if reading_start == -1:
    return text
  return text[reading_start:]


def extract_section_b(text: str) -> str:
  reading_text = get_reading_scope(text)
  start = find_idx(reading_text, ["Section B"])
  if start == -1:
    return ""

  block = reading_text[start:]
  end = find_idx(block, ["Section C", "Passage One"])
  if end == -1:
    block = block.strip()
  else:
    block = block[:end].strip()

  # Trim section instructions and keep article body if A./B./... markers exist.
  marker = re.search(r"(^|\n)A\.\s", block)
  if marker:
    block = block[marker.start() :].strip()

  return normalize_passage_text(block)


def extract_section_c_passages(text: str) -> tuple[str, str]:
  reading_text = get_reading_scope(text)
  c_idx = find_idx(reading_text, ["Section C"])
  if c_idx == -1:
    return "", ""
  c_text = reading_text[c_idx:]

  p1_idx = find_idx(c_text, ["Passage One"])
  p2_idx = find_idx(c_text, ["Passage Two"])
  if p1_idx == -1 or p2_idx == -1 or p2_idx <= p1_idx:
    return "", ""

  p1_block = c_text[p1_idx:p2_idx].strip()
  p2_block = c_text[p2_idx:].strip()

  # trim question/options tail where possible
  q46 = p1_block.find("\n46.")
  if q46 != -1:
    p1_block = p1_block[:q46].strip()

  q51 = p2_block.find("\n51.")
  if q51 != -1:
    p2_block = p2_block[:q51].strip()

  # remove heading lines
  p1_block = re.sub(
    r"^Passage One\s*Questions\s+46\s+to\s+50\s+are\s+based\s+on\s+the\s+following\s+passage\.\s*",
    "",
    p1_block,
    flags=re.IGNORECASE | re.DOTALL,
  ).strip()
  p2_block = re.sub(
    r"^Passage Two\s*Questions\s+51\s+to\s+55\s+are\s+based\s+on\s+the\s+following\s+passage\.\s*",
    "",
    p2_block,
    flags=re.IGNORECASE | re.DOTALL,
  ).strip()

  return normalize_passage_text(p1_block), normalize_passage_text(p2_block)


def infer_meta_from_name(pdf_name: str) -> PaperMeta | None:
  # e.g. 2025年6月英语六级真题(第1套).pdf
  m = re.search(r"(?P<year>\d{4})年(?P<month>\d{1,2})月.*?六级.*?\(第(?P<set>\d+)套\)", pdf_name)
  if not m:
    return None
  year = int(m.group("year"))
  month = int(m.group("month"))
  set_no = int(m.group("set"))
  return PaperMeta(
    paper_id=f"cet6-{year}-{month:02d}-set{set_no}",
    exam="六级",
    year=year,
    month=month,
    set_no=set_no,
  )


def build_output(meta: PaperMeta, section_b: str, p1: str, p2: str) -> dict:
  return {
    "paper": {
      "id": meta.paper_id,
      "exam": meta.exam,
      "year": meta.year,
      "month": meta.month,
      "set": meta.set_no,
      "title": f"{meta.year}年{meta.month}月英语{meta.exam}真题（第{meta.set_no}套）",
    },
    "passages": [
      {
        "id": f"{meta.paper_id}-section-b",
        "section": "Section B",
        "title": f"{meta.year}年{meta.month}月第{meta.set_no}套 · Section B",
        "level": "CET-6",
        "category": "Exam Reading",
        "modeLabel": "阅读学习模式",
        "content": section_b,
        "highlightSeeds": [],
      },
      {
        "id": f"{meta.paper_id}-section-c-passage-1",
        "section": "Section C · Passage One",
        "title": f"{meta.year}年{meta.month}月第{meta.set_no}套 · Section C Passage 1",
        "level": "CET-6",
        "category": "Exam Reading",
        "modeLabel": "阅读学习模式",
        "content": p1,
        "highlightSeeds": [],
      },
      {
        "id": f"{meta.paper_id}-section-c-passage-2",
        "section": "Section C · Passage Two",
        "title": f"{meta.year}年{meta.month}月第{meta.set_no}套 · Section C Passage 2",
        "level": "CET-6",
        "category": "Exam Reading",
        "modeLabel": "阅读学习模式",
        "content": p2,
        "highlightSeeds": [],
      },
    ],
  }


def main() -> None:
  parser = argparse.ArgumentParser(description="Convert CET-6 PDF into paper JSON (semi-auto).")
  parser.add_argument("--pdf", required=True, help="Path to source PDF")
  parser.add_argument("--paper-id", help="Paper ID, e.g. cet6-2025-06-set1")
  parser.add_argument("--exam", default="六级")
  parser.add_argument("--year", type=int)
  parser.add_argument("--month", type=int)
  parser.add_argument("--set", dest="set_no", type=int)
  parser.add_argument("--out", help="Output json path, default data/papers/<paper-id>.json")
  args = parser.parse_args()

  pdf_path = Path(args.pdf)
  if not pdf_path.exists():
    raise SystemExit(f"PDF not found: {pdf_path}")

  inferred = infer_meta_from_name(pdf_path.name)
  if args.paper_id and args.year and args.month and args.set_no:
    meta = PaperMeta(args.paper_id, args.exam, args.year, args.month, args.set_no)
  elif inferred:
    meta = inferred
    if args.paper_id:
      meta.paper_id = args.paper_id
    if args.exam:
      meta.exam = args.exam
  else:
    raise SystemExit("Unable to infer metadata from filename. Please provide --paper-id --year --month --set")

  text = read_pdf_text(pdf_path)
  section_b = extract_section_b(text)
  p1, p2 = extract_section_c_passages(text)

  if not section_b or not p1 or not p2:
    raise SystemExit("Failed to extract Section B / Section C passages. Please check PDF text quality.")

  output = build_output(meta, section_b, p1, p2)

  out_path = Path(args.out) if args.out else Path("data/papers") / f"{meta.paper_id}.json"
  out_path.parent.mkdir(parents=True, exist_ok=True)
  out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")

  print(f"[pdf_to_paper] written: {out_path}")
  print(f"[pdf_to_paper] section_b_chars={len(section_b)} p1_chars={len(p1)} p2_chars={len(p2)}")


if __name__ == "__main__":
  main()
