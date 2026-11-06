#!/usr/bin/env python3
"""Build the story site: stories/*.md -> docs/*.html (Python 3 stdlib only).

Usage: python3 build.py [--src DIR]
Idempotent. Validates first (spec Section 9 check 1) and writes nothing if invalid.
"""
import argparse
import glob
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys

EXPECTED_SLUGS = 77
EXPECTED_COUNTS = {"japan": 1, "city": 16, "spot": 60}
SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
STATUSES = ("placeholder", "draft", "checked", "voiced")
LEVELS = ("japan", "city", "spot")
JAPAN_CHAPTERS = 4


# ---------- parsing ----------
def parse_story(path):
    """Strict YAML subset: `key: scalar`, `key: []`, `key:` + `  - item` lines."""
    with open(path, encoding="utf-8") as f:
        text = f.read()
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.S)
    if not m:
        raise ValueError("no front matter block")
    fm, body = {}, m.group(2)
    key = None
    for n, line in enumerate(m.group(1).split("\n"), 2):
        if not line.strip():
            continue
        item = re.match(r"^  - (.*)$", line)
        if item:
            if key is None or not isinstance(fm.get(key), list):
                raise ValueError("line %d: list item without a list key" % n)
            fm[key].append(unquote(item.group(1)))
            continue
        kv = re.match(r"^([a-z_]+):(?: (.*))?$", line)
        if not kv:
            raise ValueError("line %d: cannot parse %r" % (n, line))
        key, val = kv.group(1), (kv.group(2) or "").strip()
        if key in fm:
            raise ValueError("line %d: duplicate key %s" % (n, key))
        if val == "[]" or (val == "" and key in ("look_for", "ja_names", "sources", "chapters")):
            fm[key] = []
        else:
            fm[key] = unquote(val)
    return fm, body


def unquote(v):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    return v


def paragraphs(body):
    return [re.sub(r"\s*\n\s*", "", p.strip()) for p in re.split(r"\n\s*\n", body) if p.strip()]


def chapter_scripts(body):
    parts = re.split(r"(?m)^## .*$", body)
    return [paragraphs(p) for p in parts[1:]]


# ---------- validation ----------
def load_all(src):
    stories, errors = {}, []
    files = sorted(glob.glob(os.path.join(src, "stories", "*.md")))
    for path in files:
        fname = os.path.basename(path)[:-3]
        try:
            fm, body = parse_story(path)
        except ValueError as e:
            errors.append("%s.md: %s" % (fname, e))
            continue
        slug = fm.get("slug", "")
        if slug in stories:
            errors.append("duplicate slug %r (in %s.md and %s.md)" % (slug, stories[slug]["file"], fname))
            continue
        fm["file"], fm["body"] = fname, body
        stories[slug or "?" + fname] = fm
    return stories, errors


def validate(stories, errors):
    levels = {}
    for slug, s in stories.items():
        where = "%s.md" % s["file"]
        if not SLUG_RE.match(slug):
            errors.append("%s: slug %r must match ^[a-z0-9]+(-[a-z0-9]+)*$ (lowercase ascii, digits, hyphens)" % (where, slug))
        if len(slug) > 24:
            errors.append("%s: slug %r is %d chars, max 24" % (where, slug, len(slug)))
        if s["file"] != slug:
            errors.append("%s: file name must equal slug %r" % (where, slug))
        lv = s.get("level")
        if lv not in LEVELS:
            errors.append("%s: level %r must be one of %s" % (where, lv, "/".join(LEVELS)))
        levels[lv] = levels.get(lv, 0) + 1
        if s.get("status") not in STATUSES:
            errors.append("%s: status %r must be one of %s" % (where, s.get("status"), "/".join(STATUSES)))
        for k in ("name_zh", "name_ja"):
            if not s.get(k):
                errors.append("%s: %s is empty" % (where, k))
        if not re.match(r"^\d+$", s.get("order", "")):
            errors.append("%s: order must be an integer" % where)
        for k in ("look_for", "ja_names", "sources"):
            if not isinstance(s.get(k), list):
                errors.append("%s: %s must be a list" % (where, k))
        if lv == "japan":
            if s.get("parent"):
                errors.append("%s: japan must have no parent" % where)
            ch = s.get("chapters")
            if not isinstance(ch, list) or len(ch) != JAPAN_CHAPTERS:
                errors.append("%s: japan needs exactly %d chapters" % (where, JAPAN_CHAPTERS))
        elif lv == "city":
            if s.get("parent") != "japan":
                errors.append("%s: city parent must be 'japan', got %r" % (where, s.get("parent")))
        elif lv == "spot":
            p = s.get("parent")
            if p not in stories:
                errors.append("%s: spot parent %r does not exist" % (where, p))
            elif stories[p].get("level") != "city":
                errors.append("%s: spot parent %r is not a city" % (where, p))
            if s.get("status") not in (None, "placeholder") and s.get("status") in STATUSES:
                lf = s.get("look_for") or []
                if len(lf) != 3:
                    errors.append("%s: status %s needs exactly 3 look_for items, found %d" % (where, s["status"], len(lf)))
                for it in lf:
                    if len(it) > 20:
                        errors.append("%s: look_for item longer than 20 chars (%d): %r" % (where, len(it), it))
    if len(stories) != EXPECTED_SLUGS:
        errors.append("expected %d unique slugs, found %d" % (EXPECTED_SLUGS, len(stories)))
    for lv, want in EXPECTED_COUNTS.items():
        if levels.get(lv, 0) != want:
            errors.append("expected %d %s stories, found %d" % (want, lv, levels.get(lv, 0)))
    return errors


# ---------- audio ----------
def ffprobe_bin():
    return shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"


def duration(path):
    try:
        out = subprocess.run(
            [ffprobe_bin(), "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
            capture_output=True, text=True, check=True).stdout.strip()
        d = float(out)
    except (OSError, subprocess.CalledProcessError, ValueError) as e:
        raise SystemExit("ffprobe failed on %s: %s" % (path, e))
    if d <= 0:
        raise SystemExit("audio %s has zero length" % path)
    return d


def fmt(sec):
    sec = int(round(sec))
    return "%d:%02d" % (sec // 60, sec % 60)


# ---------- rendering ----------
E = html.escape
BLOCK = re.compile(r"\{\{#(\w+)\}\}(.*?)\{\{/\1\}\}", re.S)
VAR = re.compile(r"\{\{(\w+)\}\}")


def render(template, flags, ctx):
    prev = None
    while prev != template:
        prev = template
        template = BLOCK.sub(lambda m: m.group(2) if m.group(1) in flags else "", template)
    return VAR.sub(lambda m: str(ctx.get(m.group(1), "")), template)


def short_hash(path):
    with open(path, "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()[:8]


def write_if_changed(path, data):
    if os.path.exists(path):
        with open(path, "rb") as f:
            if f.read() == data:
                return
    with open(path, "wb") as f:
        f.write(data)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=here, help="site directory (default: this script's directory)")
    src = os.path.abspath(ap.parse_args().src)

    stories, errors = load_all(src)
    errors = validate(stories, errors)
    if errors:
        print("VALIDATION FAILED (%d problem%s), nothing written:" % (len(errors), "" if len(errors) == 1 else "s"), file=sys.stderr)
        for e in errors:
            print("  - " + e, file=sys.stderr)
        sys.exit(1)

    docs = os.path.join(src, "docs")
    tdir = os.path.join(src, "templates")
    os.makedirs(os.path.join(docs, "a"), exist_ok=True)
    with open(os.path.join(tdir, "page.html"), encoding="utf-8") as f:
        template = f.read()
    for name in ("style.css", "player.js"):
        shutil.copyfile(os.path.join(tdir, name), os.path.join(docs, name))
    css_v, js_v = short_hash(os.path.join(docs, "style.css")), short_hash(os.path.join(docs, "player.js"))

    children = {}
    for slug, s in stories.items():
        if s["level"] != "japan":
            children.setdefault(s["parent"], []).append(slug)
    for k in children:
        children[k].sort(key=lambda x: int(stories[x]["order"]))

    # audio per story: list of (path, rel) ; voiced only if status voiced and every file exists
    def audio_files(slug):
        if stories[slug]["level"] == "japan":
            return ["a/japan-%d.mp3" % i for i in range(1, JAPAN_CHAPTERS + 1)]
        return ["a/%s.mp3" % slug]

    audio_found = 0
    for slug in stories:
        audio_found += sum(1 for r in audio_files(slug) if os.path.isfile(os.path.join(docs, r)))

    dur_cache = {}

    def dur(rel):
        if rel not in dur_cache:
            dur_cache[rel] = duration(os.path.join(docs, rel))
        return dur_cache[rel]

    def is_voiced(slug):
        s = stories[slug]
        if s["status"] != "voiced":
            return False
        missing = [r for r in audio_files(slug) if not os.path.isfile(os.path.join(docs, r))]
        if missing:
            print("warning: %s is voiced but audio is missing (%s); rendering placeholder" % (slug, ", ".join(missing)))
            return False
        return True

    voiced = {slug: is_voiced(slug) for slug in stories}

    def total_len(slug):
        return sum(dur(r) for r in audio_files(slug))

    def list_row(slug):
        s = stories[slug]
        length = fmt(total_len(slug)) if voiced[slug] else "准备中"
        ja = '<span class="jp" lang="ja">%s</span>' % E(s["name_ja"]) if s["name_ja"] != s["name_zh"] else ""
        return ('<li><a class="row" href="%s.html"><span class="names"><span class="zh">%s</span>%s</span>'
                '<span class="len">%s</span></a></li>' % (E(slug), E(s["name_zh"]), ja, E(length)))

    written, full, placeholders = set(), 0, 0
    for slug, s in stories.items():
        level, v = s["level"], voiced[slug]
        flags = {level}
        flags.add("voiced" if v else "placeholder")
        ctx = {
            "page_title": E(s["name_zh"] + " · 日本之旅"),
            "css_v": css_v, "js_v": js_v, "variant": level,
            "name_zh": E(s["name_zh"]), "name_ja": E(s["name_ja"]),
        }
        if s["name_ja"] != s["name_zh"]:
            flags.add("has_ja")
        if level == "spot":
            p = stories[s["parent"]]
            ctx["parent_href"] = E(s["parent"]) + ".html"
            ctx["parent_name"] = E(p["name_zh"])
        if level in ("city", "japan"):
            kids = children.get(slug, [])
            if kids:
                flags.add("has_spots")
            ctx["spot_count"] = ctx["city_count"] = len(kids)
            ctx["rows_html"] = "".join(list_row(k) for k in kids)
        if v:
            if level == "japan":
                titles = s["chapters"]
                scripts = chapter_scripts(s["body"])
                tracks = []
                for i, t in enumerate(titles, 1):
                    rel = "a/japan-%d.mp3" % i
                    tracks.append({"src": rel, "title": t, "dur": round(dur(rel), 2)})
                ctx["first_title"] = E(titles[0])
                story = []
                for i, t in enumerate(titles):
                    story.append("<h3>%s</h3>" % E(t))
                    story += ["<p>%s</p>" % E(p) for p in (scripts[i] if i < len(scripts) else [])]
                ctx["story_html"] = "".join(story)
            else:
                rel = "a/%s.mp3" % slug
                tracks = [{"src": rel, "title": s["name_zh"], "dur": round(dur(rel), 2)}]
                ctx["story_html"] = "".join("<p>%s</p>" % E(p) for p in paragraphs(s["body"]))
            total = tracks[0]["dur"]
            ctx["tracks_json"] = E(json.dumps(tracks, ensure_ascii=False), quote=True)
            ctx["first_src"] = E(tracks[0]["src"])
            ctx["duration_s"] = "%.2f" % total
            ctx["duration_fmt"] = fmt(total)
            ctx["look_items"] = "".join("<li>%s</li>" % E(x) for x in s["look_for"])
            if s["sources"]:
                flags.add("has_sources")
                ctx["source_items"] = "".join(
                    '<li><a href="%s" rel="noopener noreferrer">%s</a></li>' % (E(u, quote=True), E(u)) if u.startswith("http")
                    else "<li>%s</li>" % E(u) for u in s["sources"])
            full += 1
        else:
            placeholders += 1
        if level == "japan":
            rows = []
            for i, t in enumerate(s["chapters"], 1):
                if v:
                    rows.append('<li><button type="button" class="row" data-chapter><span class="num">%d</span>'
                                '<span class="zh">%s</span><span class="len">%s</span></button></li>'
                                % (i, E(t), fmt(dur("a/japan-%d.mp3" % i))))
                else:
                    rows.append('<li><div class="row"><span class="num">%d</span><span class="zh">%s</span>'
                                '<span class="len">准备中</span></div></li>' % (i, E(t)))
            ctx["chapter_rows"] = "".join(rows)
        out = "index.html" if level == "japan" else slug + ".html"
        write_if_changed(os.path.join(docs, out), render(template, flags, ctx).encode("utf-8"))
        written.add(out)

    stale = 0
    for path in glob.glob(os.path.join(docs, "*.html")):
        if os.path.basename(path) not in written:
            os.remove(path)
            stale += 1

    c = {lv: sum(1 for s in stories.values() if s["level"] == lv) for lv in LEVELS}
    print("slugs %d (japan %d, city %d, spot %d) | pages written %d | full pages %d | placeholders %d | audio files found %d | stale removed %d"
          % (len(stories), c["japan"], c["city"], c["spot"], len(written), full, placeholders, audio_found, stale))
    if len(written) != len(stories):
        sys.exit("pages written (%d) != slugs (%d)" % (len(written), len(stories)))


if __name__ == "__main__":
    main()
