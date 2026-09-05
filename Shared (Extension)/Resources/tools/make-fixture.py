#!/usr/bin/env python3
"""Build a small spec-conformant Origami Text EPUB for testing (spec v1.0, §§2–8)."""
import hashlib, json, uuid, zipfile, sys, html
from pathlib import Path

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "sample-origami.epub")
ORIGAMI_ID = "f.hegla.093252x"

def identifier_from(origami_id: str) -> str:
    h = bytearray(hashlib.sha256(("origami-text:" + origami_id).encode()).digest()[:16])
    h[6] = (h[6] & 0x0F) | 0x50
    h[8] = (h[8] & 0x3F) | 0x80
    x = h.hex().upper()
    return f"urn:uuid:{x[:8]}-{x[8:12]}-{x[12:16]}-{x[16:20]}-{x[20:]}"

IDENT = identifier_from(ORIGAMI_ID)
TITLE = "Folding the Page: Notes Toward Origami Text"
AUTHOR = "Frode Hegland"
DATE = "2026-09-04"

bib3 = "@article{hegland2026headset,\n  author = {Hegland, Frode},\n  title = {Use Cases for Headset Work},\n  journal = {ACM Hypertext},\n  year = {2026},\n  doi = {10.1145/0000000.0000001}\n}"
csl3 = {"id": "hegland2026headset", "type": "article-journal", "title": "Use Cases for Headset Work",
        "author": [{"family": "Hegland", "given": "Frode"}], "issued": {"date-parts": [[2026]]},
        "container-title": "ACM Hypertext", "DOI": "10.1145/0000000.0000001"}
bib1 = "@article{engelbart1962,\n  author = {Engelbart, Douglas C.},\n  title = {Augmenting Human Intellect: A Conceptual Framework},\n  journal = {SRI Summary Report AFOSR-3223},\n  year = {1962}\n}"
csl1 = {"id": "engelbart1962", "type": "article-journal", "title": "Augmenting Human Intellect: A Conceptual Framework",
        "author": [{"family": "Engelbart", "given": "Douglas C."}], "issued": {"date-parts": [[1962]]},
        "container-title": "SRI Summary Report AFOSR-3223"}
bib2 = "@misc{f.hegla.101500k,\n  author = {Hegland, Frode},\n  title = {Digital Letters},\n  year = {2026},\n  howpublished = {origamitext://open/f.hegla.101500k}\n}"
csl2 = {"id": "f.hegla.101500k", "type": "article-journal", "title": "Digital Letters",
        "author": [{"family": "Hegland", "given": "Frode"}], "issued": {"date-parts": [[2026]]},
        "URL": "origamitext://open/f.hegla.101500k"}

def attr(s): return html.escape(s, quote=True)

body = f"""<header>
  <h1>{TITLE}</h1>
  <p class="byline">{AUTHOR} · 4 September 2026 · Wimbledon</p>
</header>
<main>
<section>
<p id="1B" data-id="p1">A document is not a page. It is a set of relationships that a page happens to flatten. This note argues that a standard EPUB can carry those relationships without ceasing to be a standard EPUB.</p>
<p id="1C" data-id="p2">The argument owes almost everything to <dfn data-concept="Augmentation">augmentation</dfn> as Engelbart framed it <a class="citation" href="#ref-1" data-citation-id="engelbart1962">[1]</a>, and to the practical experience of writing in <dfn data-concept="Author">Author</dfn>.</p>
</section>
<section>
<h2 id="2" data-id="A1B2C3D4-0000-4000-8000-000000000002">Two identities</h2>
<p id="2B" data-id="p3">Every element carries a human address and a stable id. The address is what you say aloud; the stable id is what the map remembers.<a role="doc-noteref" href="#fn1">‡</a></p>
<p id="2C" data-id="p4">Addresses may change between exports. Stable ids do not. <a class="ot-stretchtext" href="#stretch-1" role="button" aria-controls="stretch-1" aria-expanded="false">»»</a></p>
<aside class="ot-stretchtext-content" id="stretch-1" hidden="hidden">
<p id="2D" data-id="p5">The reason is mundane: a re-export renumbers sections when a heading is inserted, but the paragraph's own id from the source document survives, so layouts and citations keep pointing at the right thing.</p>
<p id="2E" data-id="p6">Readers should therefore store position and annotations against <code>data-id</code>, and resolve incoming fragments by <code>id</code> first, then <code>data-id</code>.</p>
</aside>
<p id="2F" data-id="p7">The earlier letters app <a class="citation" href="#ref-2" data-citation-id="f.hegla.101500k" data-origami-ref="cites:f.hegla.101500k#p3">[2]</a> applies the same rule to email.</p>
</section>
<section>
<h2 id="3" data-id="A1B2C3D4-0000-4000-8000-000000000003">Visual-Meta as a fold</h2>
<p id="3B" data-id="p8">The metadata rides inside the document, in two identical copies. A print of the document keeps it; a PDF keeps it; a paste into a chat window keeps it. <dfn data-concept="Visual-Meta">Visual-Meta</dfn> is a fold, not an attachment.</p>
<p id="3C" data-id="p9">In headset work the same structure opens into space <a class="citation" href="#ref-3" data-citation-id="hegland2026headset">[3]</a>: headings become nodes, citations become nodes, and a view is nothing but positions.</p>
<figure id="3D" data-id="fig1"><img src="images/fold.png" alt="A square of paper folded once along its diagonal." /></figure>
<table id="3E" data-id="t1" data-table-id="T-0001">
<tr><th>Copy</th><th>Location</th></tr>
<tr><td>1</td><td>visual-meta.json</td></tr>
<tr><td>2</td><td>content/paper.html</td></tr>
</table>
<hr id="3F" data-id="p10" />
<p id="3G" data-id="p11">Energy, for the physicists among us, remains $E = mc^2$.</p>
</section>
<section>
<h2 id="4" data-id="A1B2C3D4-0000-4000-8000-000000000004">Notes</h2>
<p id="4B" data-id="fn1">‡ The word <em>stable</em> is doing a lot of work here; it means stable across exports of the same evolving document, not eternal.</p>
</section>
</main>
<section id="references">
<h2>References</h2>
<ol>
  <li id="ref-1" data-bibtex="{attr(bib1)}" data-csl-json="{attr(json.dumps(csl1))}">Engelbart, Douglas C. (1962). Augmenting Human Intellect: A Conceptual Framework. SRI Summary Report AFOSR-3223.</li>
  <li id="ref-2" data-bibtex="{attr(bib2)}" data-csl-json="{attr(json.dumps(csl2))}">Hegland, Frode (2026). Digital Letters. origamitext://open/f.hegla.101500k</li>
  <li id="ref-3" data-bibtex="{attr(bib3)}" data-csl-json="{attr(json.dumps(csl3))}">Hegland, Frode (2026). Use Cases for Headset Work. ACM Hypertext. https://doi.org/10.1145/0000000.0000001</li>
</ol>
</section>
"""

vm = {
  "visual-meta": {"version": "1.0", "generator": "Origami Text (LiquidView)",
                  "introduction": "This is Visual-Meta: the metadata of this document, carried inside it. See https://visual-meta.info"},
  "document": {"title": TITLE, "authors": [AUTHOR], "date": DATE, "identifier": IDENT, "origami-id": ORIGAMI_ID,
               "publication": "Future Text Lab notes", "abstract": "A short argument that EPUB can carry a document's relationships.",
               "keywords": ["hypertext", "EPUB", "Visual-Meta"], "isbn": "", "doi": ""},
  "structure": {"headings": [
      {"address": "2", "id": "A1B2C3D4-0000-4000-8000-000000000002", "level": 1, "text": "Two identities"},
      {"address": "3", "id": "A1B2C3D4-0000-4000-8000-000000000003", "level": 1, "text": "Visual-Meta as a fold"},
      {"address": "4", "id": "A1B2C3D4-0000-4000-8000-000000000004", "level": 1, "text": "Notes"}]},
  "concepts": [
      {"id": "C-0001", "name": "Augmentation", "description": "Engelbart's programme: improving the capability of people to approach complex problems, by co-evolving tools and practice.", "tag": "concept", "urls": [], "citationIdentifiers": ["engelbart1962"]},
      {"id": "C-0002", "name": "Author", "description": "The macOS/visionOS writing application in which this document was written.", "tag": "concept", "urls": ["https://augmentedtext.info"], "citationIdentifiers": []},
      {"id": "C-0003", "name": "Visual-Meta", "description": "Metadata carried inside the document as human-readable text, so it survives every transformation the document survives.", "tag": "concept", "urls": ["https://visual-meta.info"], "citationIdentifiers": []},
      {"id": "A1B2C3D4-0000-4000-8000-000000000002", "name": "Two identities", "description": "", "tag": "heading", "urls": [], "citationIdentifiers": [], "address": "2"},
      {"id": "A1B2C3D4-0000-4000-8000-000000000003", "name": "Visual-Meta as a fold", "description": "", "tag": "heading", "urls": [], "citationIdentifiers": [], "address": "3"}],
  "citations": [
      {"id": "engelbart1962", "name": "Augmenting Human Intellect: A Conceptual Framework", "authors": ["Engelbart, Douglas C."], "year": "1962", "publication": "SRI Summary Report AFOSR-3223", "doi": "", "urls": [], "abstract": "", "bibtex": bib1, "csl": csl1},
      {"id": "f.hegla.101500k", "name": "Digital Letters", "authors": ["Hegland, Frode"], "year": "2026", "publication": "", "doi": "", "urls": ["origamitext://open/f.hegla.101500k"], "abstract": "", "bibtex": bib2, "csl": csl2},
      {"id": "hegland2026headset", "name": "Use Cases for Headset Work", "authors": ["Hegland, Frode"], "year": "2026", "publication": "ACM Hypertext", "doi": "10.1145/0000000.0000001", "urls": ["https://doi.org/10.1145/0000000.0000001"], "abstract": "", "bibtex": bib3, "csl": csl3}],
  "map": {"nodes": [
      {"id": "C-0001", "label": "Augmentation", "kind": "concept"}, {"id": "C-0003", "label": "Visual-Meta", "kind": "concept"},
      {"id": "A1B2C3D4-0000-4000-8000-000000000002", "label": "Two identities", "kind": "heading"},
      {"id": "engelbart1962", "label": "Engelbart 1962", "kind": "citation"}],
    "connections": [{"from": "C-0001", "to": "engelbart1962"}, {"from": "A1B2C3D4-0000-4000-8000-000000000002", "to": "C-0003"}],
    "views": [{"id": "V-0001", "name": "Grill", "space": {"units": "points", "convention": "right-handed-y-up"},
               "nodes": [{"ref": "C-0001", "x": -220.0, "y": 40.0, "z": 0.0}, {"ref": "C-0003", "x": 180.0, "y": -60.0, "z": -1.71},
                         {"ref": "A1B2C3D4-0000-4000-8000-000000000002", "x": 0.0, "y": 120.0, "z": 0.0},
                         {"ref": "engelbart1962", "x": -300.0, "y": -140.0, "z": 0.0}]}]},
  "tables": [{"identifier": "T-0001", "rowCount": 3, "columnCount": 2,
              "cells": [[{"value": "Copy"}, {"value": "Location"}], [{"value": "1"}, {"value": "visual-meta.json"}], [{"value": "2"}, {"value": "content/paper.html"}]]}]
}
vm_json = json.dumps(vm, indent=2, sort_keys=True, ensure_ascii=False)

paper = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8" />
  <title>{html.escape(TITLE)}</title>
  <link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
{body}
<section id="visual-meta">
<h2>Visual-Meta</h2>
<p>The following is the metadata for this document, presented here for robust, long term preservation.</p>
<p>@visual-meta-start</p>
<script type="application/json" id="visual-meta-payload">
<![CDATA[
{vm_json.replace("]]>", "]]]]><![CDATA[>")}
]]>
</script>
<p>@visual-meta-end</p>
</section>
</body>
</html>
"""

nav = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head><meta charset="utf-8" /><title>Contents</title></head>
<body>
<nav epub:type="toc" role="doc-toc">
<h1>Contents</h1>
<ol>
  <li><a href="paper.html#2">Two identities</a></li>
  <li><a href="paper.html#3">Visual-Meta as a fold</a></li>
  <li><a href="paper.html#4">Notes</a></li>
</ol>
</nav>
</body>
</html>
"""

css = """body { font-family: Georgia, serif; line-height: 1.5; }
.byline { color: #666; }
.speaker { font-weight: bold; }
figure img { max-width: 100%; }
a.citation { text-decoration: none; }
dfn { font-style: normal; border-bottom: 1px dotted; }
#references li { margin-bottom: 0.5em; }
#visual-meta { font-size: 0.8em; color: #777; }
hr { border: 0; border-top: 1px solid #ccc; }
"""

opf = f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">{IDENT}</dc:identifier>
    <dc:title>{html.escape(TITLE)}</dc:title>
    <dc:creator>{AUTHOR}</dc:creator>
    <dc:language>en</dc:language>
    <dc:date>{DATE}</dc:date>
    <meta property="dcterms:modified">2026-09-04T12:00:00Z</meta>
    <meta property="schema:accessMode">textual</meta>
    <meta property="schema:accessMode">visual</meta>
    <meta property="schema:accessModeSufficient">textual</meta>
    <meta property="schema:accessModeSufficient">textual,visual</meta>
    <meta property="schema:accessibilityFeature">tableOfContents</meta>
    <meta property="schema:accessibilityFeature">readingOrder</meta>
    <meta property="schema:accessibilityFeature">structuralNavigation</meta>
    <meta property="schema:accessibilityFeature">ARIA</meta>
    <meta property="schema:accessibilityFeature">alternativeText</meta>
    <meta property="schema:accessibilityHazard">none</meta>
    <meta property="schema:accessibilitySummary">A structured document with headings, a table of contents and a reading order. All images have alternative text.</meta>
  </metadata>
  <manifest>
    <item id="paper" href="content/paper.html" media-type="application/xhtml+xml"/>
    <item id="nav" href="content/nav.html" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="content/style.css" media-type="text/css"/>
    <item id="visual-meta" href="visual-meta.json" media-type="application/json"/>
    <item id="img1" href="content/images/fold.png" media-type="image/png"/>
  </manifest>
  <spine>
    <itemref idref="paper"/>
  </spine>
</package>
"""

container = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""

# tiny PNG: a folded square
from PIL import Image, ImageDraw
img = Image.new("RGB", (400, 400), (250, 250, 248))
d = ImageDraw.Draw(img)
d.polygon([(60, 60), (340, 60), (60, 340)], fill=(227, 230, 240), outline=(60, 70, 120))
d.polygon([(340, 60), (340, 340), (60, 340)], fill=(210, 214, 228), outline=(60, 70, 120))
d.line([(60, 340), (340, 60)], fill=(60, 70, 120), width=3)
import io
buf = io.BytesIO(); img.save(buf, "PNG")

# XML well-formedness check on paper.html
import xml.dom.minidom
xml.dom.minidom.parseString(paper.encode())

with zipfile.ZipFile(OUT, "w", compression=zipfile.ZIP_STORED) as z:
    z.writestr("mimetype", "application/epub+zip")
    z.writestr("META-INF/container.xml", container)
    z.writestr("package.opf", opf)
    z.writestr("content/paper.html", paper)
    z.writestr("content/nav.html", nav)
    z.writestr("content/style.css", css)
    z.writestr("content/images/fold.png", buf.getvalue())
    z.writestr("visual-meta.json", vm_json)
print("wrote", OUT, IDENT)
