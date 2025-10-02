"""Home page template assets."""

from __future__ import annotations

from pathlib import Path

_BASE_PATH = Path(__file__).resolve()
_TEMPLATE_PATH = _BASE_PATH.with_suffix('.html')
_STYLES_PATH = _BASE_PATH.with_suffix('.css')
_SCRIPTS_PATH = _BASE_PATH.with_suffix('.js')

HOME_TEMPLATE = _TEMPLATE_PATH.read_text(encoding='utf-8')
HOME_STYLES = _STYLES_PATH.read_text(encoding='utf-8')
HOME_SCRIPTS = _SCRIPTS_PATH.read_text(encoding='utf-8')

__all__ = [
    "HOME_TEMPLATE",
    "HOME_STYLES",
    "HOME_SCRIPTS",
]
