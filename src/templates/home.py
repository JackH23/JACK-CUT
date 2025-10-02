"""Home template exports."""

from __future__ import annotations

from .functions import build_home_template, load_home_css

HOME_HTML = build_home_template()

__all__ = ["HOME_HTML", "load_home_css"]
