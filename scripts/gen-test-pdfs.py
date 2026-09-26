#!/usr/bin/env python3
"""Generate the PDF benchmark / test corpus for the Kotlin PDF renderer (Phase 2).

Stdlib + Pillow only. PDFs are hand-written by a tiny writer with a correct
cross-reference table. Output is deterministic (seeded).

Usage:
    python3 scripts/gen-test-pdfs.py                  # all files -> test-assets/pdfs/
    python3 scripts/gen-test-pdfs.py --only vector-50p.pdf tiny-1p.pdf
    python3 scripts/gen-test-pdfs.py --out /some/dir --jobs 8 --jpeg-quality 60

Files:
    scan-300p.pdf    300 x A4 grayscale DCT (JPEG) "scanned" sheet-music pages, ~100 MB
    vector-50p.pdf   50 x Letter pure-vector score pages (Flate content streams, Helvetica)
    poster-1p.pdf    1 x A0 page with ~60k vector operators (worst case)
    mixed-10p.pdf    10 pages, mixed MediaBox sizes/orientations, /Rotate 90, CropBox
    corrupt.pdf      vector-50p.pdf truncated to 40% + garbage (must fail to open)
    not-a-pdf.pdf    a PNG renamed .pdf
    tiny-1p.pdf      minimal valid 1-page PDF (< 2 KB)
"""

import argparse
import io
import math
import multiprocessing as mp
import os
import random
import sys
import time
import zlib

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

SEED = 20260926
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT = os.path.join(REPO_ROOT, "test-assets", "pdfs")

# Tuned so scan-300p.pdf lands at ~100 MB (see summary output).
DEFAULT_JPEG_QUALITY = 45

# --------------------------------------------------------------------------
# Minimal PDF writer
# --------------------------------------------------------------------------


class PdfWriter:
    """Streams objects to disk, records byte offsets, writes a classic xref table."""

    def __init__(self, path, version="1.7"):
        self.f = open(path, "wb")
        self.offsets = {}  # obj num -> byte offset
        self.next_num = 1
        self._w(b"%PDF-" + version.encode() + b"\n%\xe2\xe3\xcf\xd3\n")

    def _w(self, data):
        self.f.write(data)

    def alloc(self):
        n = self.next_num
        self.next_num += 1
        return n

    def write_obj(self, num, body, stream=None):
        """body: bytes/str of the object's dictionary (or any object). If stream
        is given, body must be a dict string WITHOUT /Length; it is added."""
        if isinstance(body, str):
            body = body.encode("latin-1")
        if num in self.offsets:
            raise ValueError("object %d written twice" % num)
        self.offsets[num] = self.f.tell()
        self._w(b"%d 0 obj\n" % num)
        if stream is None:
            self._w(body)
        else:
            assert body.rstrip().endswith(b">>")
            body = body.rstrip()[:-2] + b" /Length %d >>" % len(stream)
            self._w(body)
            self._w(b"\nstream\n")
            self._w(stream)
            self._w(b"\nendstream")
        self._w(b"\nendobj\n")

    def close(self, root_num, info=None):
        size = self.next_num
        missing = [n for n in range(1, size) if n not in self.offsets]
        if missing:
            raise ValueError("objects allocated but never written: %r" % missing[:10])
        xref_pos = self.f.tell()
        out = [b"xref\n0 %d\n" % size, b"0000000000 65535 f\r\n"]
        for n in range(1, size):
            out.append(b"%010d 00000 n\r\n" % self.offsets[n])  # each entry 20 bytes
        self._w(b"".join(out))
        trailer = "trailer\n<< /Size %d /Root %d 0 R" % (size, root_num)
        if info is not None:
            trailer += " /Info %d 0 R" % info
        trailer += " >>\nstartxref\n%d\n%%%%EOF\n" % xref_pos
        self._w(trailer.encode())
        self.f.close()


def pdf_str(s):
    """PDF literal string (ASCII only)."""
    s = s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    return "(" + s + ")"


def fmt(v):
    s = "%.2f" % v
    s = s.rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def write_info(w, title):
    n = w.alloc()
    w.write_obj(n, "<< /Title %s /Producer (sheet-music-reader gen-test-pdfs.py) >>" % pdf_str(title))
    return n


def write_std_fonts(w):
    fonts = {}
    for key, base in (("F1", "Helvetica"), ("F2", "Helvetica-Bold"), ("F3", "Times-BoldItalic")):
        n = w.alloc()
        w.write_obj(n, "<< /Type /Font /Subtype /Type1 /BaseFont /%s /Encoding /WinAnsiEncoding >>" % base)
        fonts[key] = n
    return fonts


def font_res(fonts):
    return "/Font << " + " ".join("/%s %d 0 R" % (k, v) for k, v in fonts.items()) + " >>"


def box(b):
    return "[" + " ".join(fmt(v) for v in b) + "]"


# --------------------------------------------------------------------------
# Vector score drawing (PDF content-stream operators)
# --------------------------------------------------------------------------

KAPPA = 0.5522847498


class Ops:
    """Collects content-stream operators and counts them."""

    def __init__(self):
        self.parts = []
        self.count = 0

    def add(self, s, nops=1):
        self.parts.append(s)
        self.count += nops

    def data(self):
        return ("\n".join(self.parts) + "\n").encode("latin-1")


def ellipse_path(cx, cy, rx, ry, tilt):
    ct, st = math.cos(tilt), math.sin(tilt)

    def p(x, y):
        return fmt(cx + x * ct - y * st) + " " + fmt(cy + x * st + y * ct)

    k = KAPPA
    return (
        p(rx, 0) + " m "
        + p(rx, k * ry) + " " + p(k * rx, ry) + " " + p(0, ry) + " c "
        + p(-k * rx, ry) + " " + p(-rx, k * ry) + " " + p(-rx, 0) + " c "
        + p(-rx, -k * ry) + " " + p(-k * rx, -ry) + " " + p(0, -ry) + " c "
        + p(k * rx, -ry) + " " + p(rx, -k * ry) + " " + p(rx, 0) + " c"
    )


def text(ops, font, size, x, y, s):
    ops.add("BT /%s %s Tf %s %s Td %s Tj ET" % (font, fmt(size), fmt(x), fmt(y), pdf_str(s)), 4)


def text_width(s, size, bold=False):
    # rough Helvetica average advance
    return len(s) * size * (0.58 if bold else 0.55)


def draw_treble_clef(ops, x, bottom, gap):
    # stylised: a vertical spine, a loop around line 2 and a curl at top
    y2 = bottom + gap
    ops.add("%s w" % fmt(gap * 0.18))
    ops.add(
        "%s %s m %s %s %s %s %s %s c %s %s %s %s %s %s c %s %s %s %s %s %s c S"
        % tuple(map(fmt, (
            x + gap * 0.3, bottom - gap * 1.2,
            x + gap * 0.9, bottom - gap * 1.0, x + gap * 0.6, bottom + gap * 3.5, x + gap * 0.5, bottom + gap * 5.2,
            x - gap * 0.6, bottom + gap * 3.4, x - gap * 0.9, y2 - gap * 0.9, x + gap * 0.4, y2 - gap * 0.9,
            x + gap * 1.4, y2 - gap * 0.8, x + gap * 1.3, y2 + gap * 1.3, x + gap * 0.2, y2 + gap * 0.9,
        ))),
        5,
    )
    ops.add(ellipse_path(x + gap * 0.1, bottom - gap * 1.1, gap * 0.35, gap * 0.35, 0) + " f", 6)


def draw_bass_clef(ops, x, bottom, gap):
    y4 = bottom + 3 * gap
    ops.add("%s w" % fmt(gap * 0.22))
    ops.add(
        "%s %s m %s %s %s %s %s %s c %s %s %s %s %s %s c S"
        % tuple(map(fmt, (
            x, y4,
            x + gap * 0.2, y4 + gap * 1.1, x + gap * 1.9, y4 + gap * 1.0, x + gap * 1.7, y4 - gap * 0.6,
            x + gap * 1.5, y4 - gap * 1.8, x + gap * 0.6, y4 - gap * 2.6, x - gap * 0.2, y4 - gap * 2.9,
        ))),
        4,
    )
    ops.add(ellipse_path(x + gap * 0.2, y4, gap * 0.32, gap * 0.32, 0) + " f", 6)
    ops.add(ellipse_path(x + gap * 2.4, y4 + gap * 0.5, gap * 0.15, gap * 0.15, 0) + " f", 6)
    ops.add(ellipse_path(x + gap * 2.4, y4 - gap * 0.5, gap * 0.15, gap * 0.15, 0) + " f", 6)


def draw_vector_staff(ops, rng, x0, x1, bottom, gap, measures, notes_range, clef, batch=True,
                      final_bar=False, measure_no=None):
    """Draw one staff with notes. batch=False strokes every stem individually (heavier)."""
    # staff lines
    ops.add("%s w" % fmt(gap * 0.1))
    ops.add(" ".join("%s %s m %s %s l" % (fmt(x0), fmt(bottom + i * gap), fmt(x1), fmt(bottom + i * gap))
                     for i in range(5)) + " S", 11)
    if clef == "treble":
        draw_treble_clef(ops, x0 + gap * 1.2, bottom, gap)
    else:
        draw_bass_clef(ops, x0 + gap * 0.6, bottom, gap)
    if measure_no is not None:
        text(ops, "F1", gap * 1.4, x0, bottom + gap * 5.4, str(measure_no))
    start = x0 + gap * 4.0
    mw = (x1 - start) / measures
    bars = []
    stems = []
    heads_filled = []
    heads_hollow = []
    ledgers = []
    beams = []
    slurs = []
    rx, ry, tilt = gap * 0.62, gap * 0.45, math.radians(20)
    stem_len = gap * 3.3
    for m in range(measures):
        mx0 = start + m * mw
        n = rng.randint(*notes_range)
        step = (mw - gap * 1.6) / n
        first_pt = None
        for i in range(n):
            cx = mx0 + gap * 1.2 + i * step + rng.uniform(-0.08, 0.08) * step
            s = rng.randint(-3, 11)  # staff position, 0 = bottom line, 2 per gap
            cy = bottom + s * gap / 2
            hollow = rng.random() < 0.18
            (heads_hollow if hollow else heads_filled).append((cx, cy))
            if s <= -2:
                for ls in range(-2, s - 1, -2):
                    ledgers.append((cx, bottom + ls * gap / 2))
            if s >= 10:
                for ls in range(10, s + 1, 2):
                    ledgers.append((cx, bottom + ls * gap / 2))
            if s < 4:  # stem up
                sx, sy0, sy1 = cx + rx * 0.92, cy + ry * 0.3, cy + stem_len
            else:
                sx, sy0, sy1 = cx - rx * 0.92, cy - ry * 0.3, cy - stem_len
            stems.append((sx, sy0, sy1))
            if first_pt is None:
                first_pt = (cx, cy)
        # beams between neighbouring stems with the same direction
        mstems = stems[-n:]
        i = 0
        while i + 1 < len(mstems):
            a, b = mstems[i], mstems[i + 1]
            if rng.random() < 0.55 and (a[2] > a[1]) == (b[2] > b[1]):
                th = gap * 0.5 * (1 if a[2] > a[1] else -1)
                beams.append((a[0], a[2], b[0], b[2], th))
                i += 2
            else:
                i += 1
        if rng.random() < 0.35 and first_pt is not None:
            slurs.append((first_pt[0], mx0 + mw - gap * 1.5, bottom - gap * 1.8))
        bars.append(mx0 + mw)
    # ledger lines
    if ledgers:
        ops.add(" ".join("%s %s m %s %s l" % (fmt(x - rx * 1.6), fmt(y), fmt(x + rx * 1.6), fmt(y))
                         for x, y in ledgers) + " S", 2 * len(ledgers) + 1)
    # bar lines
    ops.add("%s w" % fmt(gap * 0.14))
    ops.add(" ".join("%s %s m %s %s l" % (fmt(x), fmt(bottom), fmt(x), fmt(bottom + 4 * gap)) for x in bars)
            + " S", 2 * len(bars) + 1)
    if final_bar:
        ops.add("%s %s %s %s re f" % (fmt(x1 - gap * 0.5), fmt(bottom), fmt(gap * 0.5), fmt(4 * gap)), 2)
    # noteheads
    for cx, cy in heads_filled:
        ops.add(ellipse_path(cx, cy, rx, ry, tilt) + " f", 6)
    for cx, cy in heads_hollow:
        ops.add(ellipse_path(cx, cy, rx, ry, tilt) + " " + ellipse_path(cx, cy, rx * 0.8, ry * 0.45, math.radians(35))
                + " f*", 11)
    # stems
    ops.add("%s w" % fmt(gap * 0.12))
    if batch:
        ops.add(" ".join("%s %s m %s %s l" % (fmt(x), fmt(a), fmt(x), fmt(b)) for x, a, b in stems) + " S",
                2 * len(stems) + 1)
    else:
        for x, a, b in stems:
            ops.add("%s %s m %s %s l S" % (fmt(x), fmt(a), fmt(x), fmt(b)), 3)
    # beams: filled quads
    for ax, ay, bx, by, th in beams:
        ops.add("%s %s m %s %s l %s %s l %s %s l h f" % (
            fmt(ax), fmt(ay), fmt(bx), fmt(by), fmt(bx), fmt(by - th), fmt(ax), fmt(ay - th)), 6)
    # slurs: filled crescent (two curves)
    for sx0, sx1, y in slurs:
        h = gap * 1.6
        ops.add("%s %s m %s %s %s %s %s %s c %s %s %s %s %s %s c f" % tuple(map(fmt, (
            sx0, y,
            sx0 + (sx1 - sx0) * 0.25, y - h, sx0 + (sx1 - sx0) * 0.75, y - h, sx1, y,
            sx0 + (sx1 - sx0) * 0.75, y - h * 0.8, sx0 + (sx1 - sx0) * 0.25, y - h * 0.8, sx0, y,
        ))), 4)


def vector_score_page(rng, pw, ph, n_staves, gap, measures, notes_range, title=None, page_label=None,
                      batch=True, margin=54, top_reserved=90, final_bar=False):
    ops = Ops()
    ops.add("0 g 0 G 1 J 1 j")
    top = ph - margin - top_reserved
    if title:
        # title block sits below the page-number band
        ty = ph - margin - top_reserved + 10
        text(ops, "F2", 26, pw / 2 - text_width(title, 26, True) / 2, ty, title)
        text(ops, "F1", 12, pw - margin - 130, ty - 28, "Composer: Test Corpus")
        text(ops, "F3", 13, margin, ty - 28, "Allegro moderato")
        top -= 50
    if page_label:
        # very large page number, top-right corner
        size = 64
        text(ops, "F2", size, pw - margin - text_width(page_label, size, True), ph - margin - size * 0.72, page_label)
    avail = top - margin
    sys_h = avail / n_staves
    for i in range(n_staves):
        bottom = top - i * sys_h - sys_h * 0.5 - 2 * gap
        draw_vector_staff(ops, rng, margin, pw - margin, bottom, gap, measures, notes_range,
                          "treble" if i % 2 == 0 else "bass", batch=batch,
                          final_bar=final_bar and i == n_staves - 1, measure_no=1 + i * measures)
        if rng.random() < 0.4:
            dyn = rng.choice(["p", "mf", "f", "pp", "cresc."])
            text(ops, "F3", gap * 2.4, margin + gap * 5 + rng.uniform(0, pw * 0.6), bottom - gap * 3.4, dyn)
    return ops


def write_page(w, parent, pages, pw, ph, content, res, extra=""):
    cnum = w.alloc()
    w.write_obj(cnum, "<< /Filter /FlateDecode >>", zlib.compress(content, 6))
    pnum = w.alloc()
    w.write_obj(pnum, "<< /Type /Page /Parent %d 0 R /MediaBox %s /Resources << %s >> /Contents %d 0 R%s >>"
                % (parent, box([0, 0, pw, ph]), res, cnum, extra))
    pages.append(pnum)
    return pnum


def finish(w, parent, pages, title, extra_pages=None):
    """Pages tree + catalog written LAST (so a truncated file has no catalog)."""
    info = write_info(w, title)
    w.write_obj(parent, "<< /Type /Pages /Kids [%s] /Count %d >>"
                % (" ".join("%d 0 R" % p for p in pages), len(pages)))
    cat = w.alloc()
    w.write_obj(cat, "<< /Type /Catalog /Pages %d 0 R >>" % parent)
    w.close(cat, info)


# --------------------------------------------------------------------------
# vector-50p.pdf
# --------------------------------------------------------------------------

def gen_vector(path):
    rng = random.Random(SEED + 50)
    w = PdfWriter(path)
    fonts = write_std_fonts(w)
    res = font_res(fonts)
    parent = w.alloc()  # written last
    pages = []
    total_ops = 0
    PW, PH = 612, 792
    for i in range(1, 51):
        ops = vector_score_page(rng, PW, PH, 10, 5.0, 4, (5, 9),
                                title="Etude in Vectors No. 7" if i == 1 else None,
                                page_label="p. %d" % i, batch=True, final_bar=(i == 50))
        text(ops, "F1", 9, PW / 2 - 20, 24, "- %d of 50 -" % i)
        total_ops += ops.count
        write_page(w, parent, pages, PW, PH, ops.data(), res)
    finish(w, parent, pages, "vector-50p")
    return {"pages": 50, "note": "~%d ops/page" % (total_ops // 50)}


# --------------------------------------------------------------------------
# poster-1p.pdf
# --------------------------------------------------------------------------

def gen_poster(path):
    rng = random.Random(SEED + 1)
    w = PdfWriter(path)
    fonts = write_std_fonts(w)
    res = font_res(fonts)
    parent = w.alloc()
    pages = []
    PW, PH = 2384, 3370  # A0 in points
    ops = vector_score_page(rng, PW, PH, 60, 3.2, 12, (5, 8), title="Poster Worst Case (A0)",
                            page_label="POSTER", batch=False, margin=60, top_reserved=120, final_bar=True)
    write_page(w, parent, pages, PW, PH, ops.data(), res)
    finish(w, parent, pages, "poster-1p")
    return {"pages": 1, "note": "%d ops" % ops.count}


# --------------------------------------------------------------------------
# mixed-10p.pdf
# --------------------------------------------------------------------------

A4 = (595.28, 841.89)
MIXED = [
    # (label, w, h, extra)
    ("A4 portrait", A4[0], A4[1], None),
    ("US Letter portrait", 612, 792, None),
    ("US Letter landscape", 792, 612, None),
    ("9 x 12 in", 648, 864, None),
    ("Very tall 8.5 x 22 in", 612, 1584, None),
    ("US Letter with /Rotate 90", 612, 792, "rotate"),
    ("A4 with CropBox inset 72pt", A4[0], A4[1], "crop"),
    ("A5 portrait", 419.53, 595.28, None),
    ("US Legal 8.5 x 14 in", 612, 1008, None),
    ("A4 landscape", A4[1], A4[0], None),
]


def gen_mixed(path):
    rng = random.Random(SEED + 10)
    w = PdfWriter(path)
    fonts = write_std_fonts(w)
    res = font_res(fonts)
    parent = w.alloc()
    pages = []
    for idx, (label, pw, ph, extra) in enumerate(MIXED, 1):
        ops = Ops()
        ops.add("0 g 0 G 1 J 1 j")
        extra_dict = ""
        if extra == "crop":
            cb = [72, 72, pw - 72, ph - 72]
            extra_dict = " /CropBox %s" % box(cb)
            # red band outside crop box: must NOT be visible
            ops.add("1 0.6 0.6 rg 0 0 %s %s re %s %s %s %s re f*" % (
                fmt(pw), fmt(ph), fmt(cb[0]), fmt(cb[1]), fmt(cb[2] - cb[0]), fmt(cb[3] - cb[1])), 4)
            ops.add("0.6 0 0 rg", 1)
            text(ops, "F2", 12, 6, ph - 20, "OUTSIDE CROPBOX - SHOULD NOT BE VISIBLE")
            text(ops, "F2", 12, 6, 8, "OUTSIDE CROPBOX - SHOULD NOT BE VISIBLE")
            ops.add("0 0 0.8 RG 3 w %s %s %s %s re S 0 g 0 G" % (
                fmt(cb[0] + 1.5), fmt(cb[1] + 1.5), fmt(cb[2] - cb[0] - 3), fmt(cb[3] - cb[1] - 3)), 5)
            x0, y0, x1, y1 = cb
        else:
            x0, y0, x1, y1 = 0, 0, pw, ph
            ops.add("0 0 0.8 RG 4 w 6 6 %s %s re S 0 G" % (fmt(pw - 12), fmt(ph - 12)), 4)
        if extra == "rotate":
            extra_dict = " /Rotate 90"
        cx = (x0 + x1) / 2
        # big index
        big = "%d / 10" % idx
        text(ops, "F2", 72, cx - text_width(big, 72, True) / 2, y1 - 110, big)
        text(ops, "F2", 20, cx - text_width(label, 20, True) / 2, y1 - 145, label)
        dims = "MediaBox %s x %s pt (%s x %s in)" % (fmt(pw), fmt(ph), fmt(pw / 72), fmt(ph / 72))
        ds = min(14, (x1 - x0 - 30) / (len(dims) * 0.55))
        text(ops, "F1", ds, cx - text_width(dims, ds) / 2, y1 - 170, dims)
        if extra == "rotate":
            note = "/Rotate 90: should DISPLAY as landscape 792 x 612, arrow points right"
            text(ops, "F1", 11, cx - text_width(note, 11) / 2, y1 - 190, note)
        if extra == "crop":
            note = "CropBox [72 72 %s %s]: visible area %s x %s pt" % (
                fmt(x1), fmt(y1), fmt(x1 - x0), fmt(y1 - y0))
            ns = min(11, (x1 - x0 - 30) / (len(note) * 0.55))
            text(ops, "F1", ns, cx - text_width(note, ns) / 2, y1 - 190, note)
        # "UP" arrow in content space
        ay = y1 - 240
        ops.add("%s %s m %s %s l %s %s l h f" % (fmt(cx), fmt(ay + 30), fmt(cx - 18), fmt(ay), fmt(cx + 18), fmt(ay)), 5)
        ops.add("%s %s %s %s re f" % (fmt(cx - 6), fmt(ay - 40), fmt(12), fmt(40)), 2)
        text(ops, "F1", 10, cx + 24, ay + 5, "top of content")
        # a few staves in the remaining space
        top = ay - 70
        n = max(1, int((top - y0 - 40) // 70))
        gap = 5.0
        for s in range(min(n, 18)):
            bottom = top - s * 70 - 20
            draw_vector_staff(ops, rng, x0 + 36, x1 - 36, bottom, gap, max(2, int((x1 - x0) // 150)), (4, 7),
                              "treble" if s % 2 == 0 else "bass", measure_no=None)
        text(ops, "F1", 9, x0 + 12, y0 + 12, "mixed-10p.pdf  page %d  %s" % (idx, label))
        write_page(w, parent, pages, pw, ph, ops.data(), res, extra_dict)
    finish(w, parent, pages, "mixed-10p")
    return {"pages": 10, "note": "mixed sizes, Rotate, CropBox"}


# --------------------------------------------------------------------------
# tiny-1p.pdf
# --------------------------------------------------------------------------

def gen_tiny(path):
    w = PdfWriter(path)
    font = w.alloc()
    w.write_obj(font, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    content = (b"BT /F1 36 Tf 72 700 Td (tiny-1p) Tj ET\n"
               b"1 w 72 600 m 540 600 l 72 606 m 540 606 l 72 612 m 540 612 l 72 618 m 540 618 l 72 624 m 540 624 l S\n")
    c = w.alloc()
    w.write_obj(c, "<< >>", content)
    parent = w.alloc()
    page = w.alloc()
    w.write_obj(page, "<< /Type /Page /Parent %d 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 %d 0 R >> >> "
                "/Contents %d 0 R >>" % (parent, font, c))
    w.write_obj(parent, "<< /Type /Pages /Kids [%d 0 R] /Count 1 >>" % page)
    cat = w.alloc()
    w.write_obj(cat, "<< /Type /Catalog /Pages %d 0 R >>" % parent)
    w.close(cat)
    return {"pages": 1, "note": "minimal"}


# --------------------------------------------------------------------------
# corrupt.pdf / not-a-pdf.pdf
# --------------------------------------------------------------------------

def gen_corrupt(path, vector_path):
    data = open(vector_path, "rb").read()
    cut = int(len(data) * 0.40)
    garbage = random.Random(SEED + 666).randbytes(8192)
    with open(path, "wb") as f:
        f.write(data[:cut])
        f.write(garbage)
    return {"pages": "-", "note": "40%% of vector-50p (%d B) + 8 KiB garbage" % cut}


def gen_not_pdf(path):
    img = Image.new("RGB", (640, 480), (245, 240, 230))
    d = ImageDraw.Draw(img)
    for i in range(5):
        d.line([(40, 200 + i * 16), (600, 200 + i * 16)], fill=(20, 20, 20), width=2)
    d.text((40, 60), "This is a PNG, not a PDF", fill=(160, 0, 0), font=ImageFont.load_default(size=36))
    img.save(path, format="PNG")
    return {"pages": "-", "note": "PNG bytes"}


# --------------------------------------------------------------------------
# scan-300p.pdf
# --------------------------------------------------------------------------

SW, SH = 2480, 3508  # A4 at 300 dpi
_FONT_CACHE = {}


def font(size):
    f = _FONT_CACHE.get(size)
    if f is None:
        f = ImageFont.load_default(size=size)
        _FONT_CACHE[size] = f
    return f


def _noise(rng, w, h, amp):
    """Deterministic zero-mean noise image (L), 128 = 0, triangular distribution +-amp."""
    a = Image.frombytes("L", (w, h), rng.randbytes(w * h))
    b = Image.frombytes("L", (w, h), rng.randbytes(w * h))
    n = ImageChops.add(a, b, scale=2.0)  # (a+b)/2, triangular around 127.5
    lut = [max(0, min(255, int(round(128 + (v - 127.5) * amp / 127.5)))) for v in range(256)]
    return n.point(lut)


def draw_scan_ink(pageno, total, rng):
    img = Image.new("L", (SW, SH), 255)
    d = ImageDraw.Draw(img)
    INK = 0
    left, right = 190, SW - 170
    # huge page number, top-right corner (~160 px digit height)
    label = "p. %d" % pageno
    f = font(220)
    bb = d.textbbox((0, 0), label, font=f)
    d.text((right - (bb[2] - bb[0]), 70 - bb[1] + 10), label, fill=INK, font=f)
    top = 380
    if pageno == 1:
        t = "Nocturne for Benchmarking"
        tf = font(110)
        bb = d.textbbox((0, 0), t, font=tf)
        d.text(((SW - (bb[2] - bb[0])) / 2, 330), t, fill=INK, font=tf)
        d.text((left, 520), "Andante sostenuto", fill=INK, font=font(56))
        d.text((right - 640, 520), "Test Corpus, Op. 300", fill=INK, font=font(56))
        top = 660
    else:
        d.text((left, 150), "Nocturne for Benchmarking", fill=INK, font=font(48))
    bottom_margin = 230
    n_staves = rng.choice((10, 11, 12))
    gap = 24
    sys_h = (SH - bottom_margin - top) / n_staves
    rx, ry = 17, 12
    for si in range(n_staves):
        b = int(top + si * sys_h + sys_h * 0.5 + 2 * gap)  # y of bottom line (image y grows down)
        for i in range(5):
            y = b - i * gap
            d.line([(left, y), (right, y)], fill=INK, width=3)
        # brace/system start line
        d.line([(left, b - 4 * gap), (left, b)], fill=INK, width=4)
        treble = si % 2 == 0
        cx = left + 50
        if treble:
            d.line([(cx + 8, b - 5.6 * gap), (cx - 4, b + 1.3 * gap)], fill=INK, width=7)
            d.ellipse([cx - 32, b - 2.5 * gap, cx + 30, b - 0.1 * gap], outline=INK, width=7)
            d.arc([cx - 6, b - 6.2 * gap, cx + 34, b - 3.8 * gap], 180, 400, fill=INK, width=7)
            d.ellipse([cx - 22, b + gap, cx, b + 1.6 * gap], fill=INK)
        else:
            y4 = b - 3 * gap
            d.ellipse([cx - 22, y4 - 10, cx + 2, y4 + 14], fill=INK)
            d.arc([cx - 22, y4 - 20, cx + 40, y4 + 60], 250, 90, fill=INK, width=8)
            d.line([(cx + 34, y4 + 40), (cx - 20, b - 0.4 * gap)], fill=INK, width=8)
            d.ellipse([cx + 52, y4 - 18, cx + 62, y4 - 8], fill=INK)
            d.ellipse([cx + 52, y4 + 8, cx + 62, y4 + 18], fill=INK)
        # key signature (sharps as hash marks)
        for k in range(rng.randint(0, 3)):
            kx, ky = left + 120 + k * 30, b - (8 - k * 3 % 7) * gap / 2
            d.line([(kx, ky - 26), (kx, ky + 26)], fill=INK, width=3)
            d.line([(kx + 14, ky - 30), (kx + 14, ky + 22)], fill=INK, width=3)
            d.line([(kx - 8, ky - 4), (kx + 22, ky - 12)], fill=INK, width=7)
            d.line([(kx - 8, ky + 12), (kx + 22, ky + 4)], fill=INK, width=7)
        if pageno == 1 and si < 2:
            tf = font(64)
            d.text((left + 230, b - 4 * gap - 6), "3", fill=INK, font=tf)
            d.text((left + 230, b - 2 * gap - 4), "4", fill=INK, font=tf)
        d.text((left - 10, b - 7.6 * gap), str(1 + si * 4 + (pageno - 1) * 44), fill=INK, font=font(30))
        start = left + 300
        measures = rng.choice((3, 4, 4, 5))
        mw = (right - start) / measures
        for m in range(measures):
            mx0 = start + m * mw
            bx = int(mx0 + mw)
            if pageno == total and si == n_staves - 1 and m == measures - 1:
                d.rectangle([bx - 14, b - 4 * gap, bx, b], fill=INK)
                d.line([(bx - 26, b - 4 * gap), (bx - 26, b)], fill=INK, width=4)
            else:
                d.line([(bx, b - 4 * gap), (bx, b)], fill=INK, width=4)
            n = rng.randint(4, 9)
            step = (mw - 70) / n
            stems = []
            for i in range(n):
                x = mx0 + 45 + i * step + rng.uniform(-6, 6)
                s = rng.randint(-3, 11)
                y = b - s * gap / 2
                if rng.random() < 0.07:  # quarter-ish rest
                    d.polygon([(x, y - 30), (x + 14, y - 12), (x + 2, y + 4), (x + 16, y + 26), (x - 2, y + 14)],
                              fill=INK)
                    continue
                if s <= -2:
                    for ls in range(-2, s - 1, -2):
                        ly = b - ls * gap / 2
                        d.line([(x - 28, ly), (x + 28, ly)], fill=INK, width=3)
                if s >= 10:
                    for ls in range(10, s + 1, 2):
                        ly = b - ls * gap / 2
                        d.line([(x - 28, ly), (x + 28, ly)], fill=INK, width=3)
                hollow = rng.random() < 0.2
                if hollow:
                    d.ellipse([x - rx, y - ry, x + rx, y + ry], outline=INK, width=5)
                else:
                    d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=INK)
                up = s < 4
                if up:
                    sx, y0, y1 = x + rx - 2, y, y - 84
                else:
                    sx, y0, y1 = x - rx + 2, y, y + 84
                d.line([(sx, y0), (sx, y1)], fill=INK, width=4)
                stems.append((sx, y1, up, hollow))
                if rng.random() < 0.05:
                    d.text((x - 50, y - 24), "#", fill=INK, font=font(46))
            j = 0
            while j + 1 < len(stems):
                a, c = stems[j], stems[j + 1]
                if a[2] == c[2] and not a[3] and not c[3] and rng.random() < 0.6:
                    th = 12 if a[2] else -12
                    d.polygon([(a[0], a[1]), (c[0], c[1]), (c[0], c[1] + th), (a[0], a[1] + th)], fill=INK)
                    j += 2
                else:
                    j += 1
            if rng.random() < 0.25:
                sx0, sx1 = mx0 + 40, mx0 + mw - 40
                d.arc([sx0, b + 1.2 * gap, sx1, b + 3.5 * gap], 10, 170, fill=INK, width=4)
        if rng.random() < 0.35:
            d.text((start + rng.randint(0, 1200), b + 2.3 * gap), rng.choice(["p", "mf", "f", "pp", "cresc."]),
                   fill=INK, font=font(52))
    return img


def render_scan_page(args):
    pageno, total, quality = args
    rng = random.Random(SEED * 1000 + pageno)
    ink = draw_scan_ink(pageno, total, rng)
    angle = rng.uniform(-0.6, 0.6)
    ink = ink.rotate(angle, resample=Image.BICUBIC, fillcolor=255)
    # small shift, like an imperfect feed
    ink = ImageChops.offset(ink, rng.randint(-12, 12), rng.randint(-12, 12))
    ink = ink.filter(ImageFilter.GaussianBlur(0.9))
    ink_dark = rng.randint(28, 48)
    ink = ink.point([int(ink_dark + v * (255 - ink_dark) / 255) for v in range(256)])
    # paper: off-white + low-frequency blotches
    paper_base = rng.randint(226, 238)
    paper = Image.new("L", (SW, SH), paper_base)
    blotch = _noise(rng, SW // 40, SH // 40, 7).resize((SW, SH), Image.BICUBIC)
    paper = ImageChops.add(paper, blotch, scale=1.0, offset=-128)
    # scanner-lid shadow along one edge
    shade = Image.linear_gradient("L").rotate(90, expand=True).resize((140, SH))  # dark->light left->right
    shade = shade.point([int(185 + v * 70 / 255) for v in range(256)])
    edge = Image.new("L", (SW, SH), 255)
    if rng.random() < 0.5:
        edge.paste(shade, (0, 0))
    else:
        edge.paste(shade.transpose(Image.FLIP_LEFT_RIGHT), (SW - 140, 0))
    paper = ImageChops.multiply(paper, edge)
    page = ImageChops.multiply(ink, paper)
    # fine grain (tiled so noise generation stays cheap)
    tile = _noise(rng, 512, 512, 4)
    grain = Image.new("L", (SW, SH))
    ox, oy = rng.randint(0, 511), rng.randint(0, 511)
    for ty in range(-oy, SH, 512):
        for tx in range(-ox, SW, 512):
            grain.paste(tile, (tx, ty))
    page = ImageChops.add(page, grain, scale=1.0, offset=-128)
    # speckle and dust
    d = ImageDraw.Draw(page)
    for _ in range(rng.randint(300, 700)):
        x, y, r = rng.randrange(SW), rng.randrange(SH), rng.choice((1, 1, 1, 2, 2, 3))
        d.ellipse([x - r, y - r, x + r, y + r], fill=rng.randint(40, 170))
    for _ in range(rng.randint(2, 6)):  # hair / scratch
        x, y = rng.randrange(SW), rng.randrange(SH)
        d.line([(x, y), (x + rng.randint(-80, 80), y + rng.randint(-80, 80))], fill=rng.randint(90, 170), width=2)
    buf = io.BytesIO()
    page.save(buf, format="JPEG", quality=quality, optimize=True, subsampling=0, dpi=(300, 300))
    return buf.getvalue()


def gen_scan(path, jobs, quality, pages=300):
    w = PdfWriter(path)
    parent = w.alloc()
    kids = []
    PW, PH = A4
    work = [(p, pages, quality) for p in range(1, pages + 1)]
    with mp.get_context("spawn" if sys.platform == "darwin" else "fork").Pool(jobs) as pool:
        for pageno, jpg in enumerate(pool.imap(render_scan_page, work, chunksize=2), 1):
            im = w.alloc()
            w.write_obj(im, "<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceGray "
                            "/BitsPerComponent 8 /Filter /DCTDecode >>" % (SW, SH), jpg)
            content = ("q %s 0 0 %s 0 0 cm /Im0 Do Q\n" % (fmt(PW), fmt(PH))).encode()
            c = w.alloc()
            w.write_obj(c, "<< >>", content)
            p = w.alloc()
            w.write_obj(p, "<< /Type /Page /Parent %d 0 R /MediaBox %s /Resources << /XObject << /Im0 %d 0 R >> >> "
                           "/Contents %d 0 R >>" % (parent, box([0, 0, PW, PH]), im, c))
            kids.append(p)
            if pageno % 50 == 0:
                print("  scan-300p: %d/%d pages" % (pageno, pages), flush=True)
    finish(w, parent, kids, "scan-300p")
    return {"pages": pages, "note": "JPEG q=%d, %dx%d gray" % (quality, SW, SH)}


# --------------------------------------------------------------------------

ALL = ["tiny-1p.pdf", "vector-50p.pdf", "corrupt.pdf", "poster-1p.pdf", "mixed-10p.pdf", "not-a-pdf.pdf",
       "scan-300p.pdf"]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--only", nargs="*", choices=ALL)
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2)))
    ap.add_argument("--jpeg-quality", type=int, default=DEFAULT_JPEG_QUALITY)
    ap.add_argument("--scan-pages", type=int, default=300, help=argparse.SUPPRESS)  # for quick calibration
    ap.add_argument("--scan-sample", type=int, help="write one scan page as PNG/JPEG to this path's dir and exit")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    if a.scan_sample:
        jpg = render_scan_page((a.scan_sample, 300, a.jpeg_quality))
        p = os.path.join(a.out, "scan-sample-p%d.jpg" % a.scan_sample)
        open(p, "wb").write(jpg)
        print(p, len(jpg))
        return
    todo = a.only or ALL
    if "corrupt.pdf" in todo and "vector-50p.pdf" not in todo and not os.path.exists(
            os.path.join(a.out, "vector-50p.pdf")):
        todo = ["vector-50p.pdf"] + list(todo)
    rows = []
    for name in ALL:
        if name not in todo:
            continue
        path = os.path.join(a.out, name)
        t0 = time.time()
        print("generating %s ..." % name, flush=True)
        if name == "tiny-1p.pdf":
            r = gen_tiny(path)
        elif name == "vector-50p.pdf":
            r = gen_vector(path)
        elif name == "corrupt.pdf":
            r = gen_corrupt(path, os.path.join(a.out, "vector-50p.pdf"))
        elif name == "poster-1p.pdf":
            r = gen_poster(path)
        elif name == "mixed-10p.pdf":
            r = gen_mixed(path)
        elif name == "not-a-pdf.pdf":
            r = gen_not_pdf(path)
        elif name == "scan-300p.pdf":
            r = gen_scan(path, a.jobs, a.jpeg_quality, a.scan_pages)
        dt = time.time() - t0
        rows.append((name, str(r["pages"]), os.path.getsize(path), dt, r["note"]))
    print()
    print("%-16s %6s %12s %10s %9s  %s" % ("file", "pages", "bytes", "size MB", "gen s", "notes"))
    print("-" * 90)
    for name, pages, size, dt, note in rows:
        print("%-16s %6s %12d %10.2f %9.2f  %s" % (name, pages, size, size / 1e6, dt, note))
    print("\noutput dir: %s" % a.out)


if __name__ == "__main__":
    main()
