"""Backwards-compatible home template entry point."""

from __future__ import annotations

from .functions import build_home_template

HOME_HTML = build_home_template()

__all__ = ["HOME_HTML"]
