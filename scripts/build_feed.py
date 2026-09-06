#!/usr/bin/env python3
"""Build The Margins RSS feed from the article JSON embedded in index.html."""

import argparse
from datetime import date, datetime, time, timezone
from email.utils import format_datetime
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from urllib.parse import quote, urlsplit
import xml.etree.ElementTree as ET


DEFAULT_SITE = "https://themarginsjournals.com"
ATOM = "http://www.w3.org/2005/Atom"
ET.register_namespace("atom", ATOM)


class SiteDataParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = {}
        self.current = None

    def handle_starttag(self, tag, attrs):
        if tag != "script":
            return
        script_id = dict(attrs).get("id")
        if script_id in {"mj-article-data", "mj-site-config"}:
            if script_id in self.scripts:
                raise ValueError(f"Duplicate script #{script_id}")
            self.current = script_id
            self.scripts[script_id] = []

    def handle_data(self, data):
        if self.current:
            self.scripts[self.current].append(data)

    def handle_endtag(self, tag):
        if tag == "script":
            self.current = None


class PlainTextParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.hidden += 1
        elif not self.hidden and tag in {"p", "br", "div", "li"}:
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in {"script", "style"} and self.hidden:
            self.hidden -= 1
        elif not self.hidden:
            self.parts.append(" ")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def plain_text(value):
    parser = PlainTextParser()
    parser.feed(value)
    parser.close()
    return " ".join("".join(parser.parts).split())


def publication_date(value, article_id):
    if not isinstance(value, str):
        raise ValueError(f"Article {article_id!r}: date must be text")
    # English month names are explicit, so the build does not depend on locale.
    months = {name: number for number, name in enumerate(
        ("January", "February", "March", "April", "May", "June", "July",
         "August", "September", "October", "November", "December"), 1)}
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            return date.fromisoformat(value)
        match = re.fullmatch(r"([A-Za-z]+) (\d{1,2}), (\d{4})", value)
        if match and match[1] in months:
            return date(int(match[3]), months[match[1]], int(match[2]))
    except ValueError:
        pass
    raise ValueError(
        f"Article {article_id!r}: invalid publication date {value!r}; "
        "use YYYY-MM-DD or Month D, YYYY (for example September 6, 2026)"
    )


def require_text(value, label):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be non-empty text")
    # ElementTree escapes markup, but XML 1.0 cannot represent control characters.
    if any(ord(char) < 32 and char not in "\t\n\r" or
           0xD800 <= ord(char) <= 0xDFFF or ord(char) in {0xFFFE, 0xFFFF}
           for char in value):
        raise ValueError(f"{label} contains a character that XML cannot represent")
    return value.strip()


def load_site(source):
    parser = SiteDataParser()
    parser.feed(source)
    parser.close()
    if "mj-article-data" not in parser.scripts:
        raise ValueError("index.html is missing script#mj-article-data")
    articles = json.loads("".join(parser.scripts["mj-article-data"]))
    if not isinstance(articles, list):
        raise ValueError("script#mj-article-data must contain a JSON array")
    config = json.loads("".join(parser.scripts.get("mj-site-config", ["{}"])))
    if not isinstance(config, dict):
        raise ValueError("script#mj-site-config must contain a JSON object")
    site_url = require_text(config.get("siteUrl", DEFAULT_SITE), "siteUrl").rstrip("/")
    parsed = urlsplit(site_url)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or
            parsed.password or parsed.query or parsed.fragment or
            any(char.isspace() for char in site_url)):
        raise ValueError("siteUrl must be an absolute HTTPS site address without a query or fragment")
    return articles, site_url


def build_feed(source, today=None):
    articles, site_url = load_site(source)
    today = today or datetime.now(timezone.utc).date()
    prepared = []
    seen = set()
    for article in articles:
        if not isinstance(article, dict):
            raise ValueError("Each article must be a JSON object")
        article_id = require_text(article.get("id"), "Article id")
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", article_id):
            raise ValueError(f"Article id {article_id!r} must use lowercase letters, digits and hyphens")
        if article_id in seen:
            raise ValueError(f"Duplicate article id {article_id!r}; every article needs one unique, permanent id")
        seen.add(article_id)
        title = require_text(article.get("title"), f"Article {article_id!r} title")
        published = publication_date(article.get("date"), article_id)
        excerpt = article.get("excerpt") or article.get("subtitle")
        if not excerpt:
            excerpt = next((block.get("text") for block in article.get("content", [])
                            if block.get("type") == "paragraph"), None)
        excerpt = plain_text(require_text(excerpt, f"Article {article_id!r} excerpt"))
        if not excerpt:
            raise ValueError(f"Article {article_id!r} excerpt contains no readable text")
        if published <= today:
            prepared.append((published, article_id, title, excerpt))

    rss = ET.Element("rss", version="2.0")
    channel = ET.SubElement(rss, "channel")
    ET.SubElement(channel, "title").text = "The Margins"
    ET.SubElement(channel, "link").text = site_url + "/"
    ET.SubElement(channel, "description").text = "Reporting on displacement, housing and water."
    ET.SubElement(channel, "language").text = "en"
    ET.SubElement(channel, f"{{{ATOM}}}link", {
        "href": site_url + "/feed.xml", "rel": "self", "type": "application/rss+xml"})
    for published, article_id, title, excerpt in sorted(prepared, reverse=True):
        item = ET.SubElement(channel, "item")
        ET.SubElement(item, "title").text = title
        ET.SubElement(item, "link").text = site_url + "/#/reporting/" + quote(article_id, safe="")
        # Identity never uses an edited title, body, update date or build timestamp.
        ET.SubElement(item, "guid", isPermaLink="false").text = "urn:the-margins:article:" + article_id
        ET.SubElement(item, "pubDate").text = format_datetime(
            datetime.combine(published, time.min, timezone.utc), usegmt=True)
        ET.SubElement(item, "description").text = excerpt
    ET.indent(rss, space="  ")
    return ET.tostring(rss, encoding="utf-8", xml_declaration=True) + b"\n", len(prepared)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("index.html"))
    parser.add_argument("--output", type=Path, default=Path("feed.xml"))
    args = parser.parse_args()
    try:
        xml, count = build_feed(args.input.read_text(encoding="utf-8"))
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(xml)
    except (OSError, ValueError, TypeError) as error:
        print(f"RSS build failed: {error}", file=sys.stderr)
        return 1
    print(f"Wrote {args.output}: {count} published articles")
    return 0


if __name__ == "__main__":
    sys.exit(main())
