"""Utilities for loading the home page template."""
from __future__ import annotations

from importlib import resources
import textwrap


_PARTS_DIR = "home_content_parts"
_STYLE_PLACEHOLDER = "__HOME_STYLES__"
_SCRIPT_PLACEHOLDER = "__HOME_SCRIPT__"


def _load_package_text(*paths: str) -> str:
    """Read a text resource relative to this package."""

    resource = resources.files(__package__).joinpath(*paths)
    return resource.read_text(encoding="utf-8")


def _indent_block(content: str, prefix: str) -> str:
    """Indent a block of text with the provided prefix."""

    stripped = content.strip("\n")
    if not stripped:
        return ""
    return textwrap.indent(stripped, prefix)


def _load_home_html() -> str:
    """Load and assemble the home page HTML template from fragments."""

    doctype = _load_package_text(_PARTS_DIR, "doctype.html").strip("\n")
    head = _load_package_text(_PARTS_DIR, "head.html")
    body = _load_package_text(_PARTS_DIR, "body.html")
    styles = _indent_block(_load_package_text(_PARTS_DIR, "styles.css"), "        ")
    script = _indent_block(_load_package_text(_PARTS_DIR, "script.js"), "        ")

    if _STYLE_PLACEHOLDER not in head:
        msg = "Home head fragment is missing the style placeholder."
        raise ValueError(msg)
    if _SCRIPT_PLACEHOLDER not in body:
        msg = "Home body fragment is missing the script placeholder."
        raise ValueError(msg)

    head = head.replace(_STYLE_PLACEHOLDER, styles)
    body = body.replace(_SCRIPT_PLACEHOLDER, script)

    html_parts = [doctype, head.rstrip(), body.rstrip()]
    return "\n".join(part for part in html_parts if part) + "\n"


HOME_HTML = _load_home_html()

__all__ = ["HOME_HTML"]
