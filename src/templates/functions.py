"""Helper utilities for assembling the home page template."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from textwrap import indent

from .body import BODY_TEMPLATE, SCRIPT_TEMPLATE
from .footer import FOOTER_TEMPLATE
from .header import HEADER_TEMPLATE

_TEMPLATE_INDENT = "        "


def _indent_block(block: str) -> str:
    """Return the provided HTML block indented for the app shell container."""
    indented = indent(block, _TEMPLATE_INDENT)
    return indented if indented.endswith("\n") else f"{indented}\n"


@lru_cache(maxsize=1)
def load_home_css() -> str:
    """Read and cache the stylesheet used by the home page template."""
    css_path = Path(__file__).with_name("home.css")
    return css_path.read_text(encoding="utf-8")


def build_home_template() -> str:
    """Assemble the full home page template from individual components."""
    parts = [
        "<!doctype html>\n",
        "<html lang=\"en\">\n",
        "<head>\n",
        "    <meta charset=\"utf-8\">\n",
        "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n",
        "    <title>Video Editor Pro</title>\n",
        "    <style>{{ home_css }}</style>\n",
        "</head>\n",
        "<body>\n",
        "    <div class=\"app-shell\">\n",
        _indent_block(HEADER_TEMPLATE),
        _indent_block(BODY_TEMPLATE),
        _indent_block(FOOTER_TEMPLATE),
        "    </div>\n",
        SCRIPT_TEMPLATE,
    ]
    if not parts[-1].endswith("\n"):
        parts[-1] += "\n"
    return "".join(parts)
