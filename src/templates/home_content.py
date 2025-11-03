"""Home page template assets."""

from __future__ import annotations

from pathlib import Path

_BASE_PATH = Path(__file__).resolve()
_TEMPLATE_PATH = _BASE_PATH.with_suffix('.html')
_STYLES_PATH = _BASE_PATH.with_suffix('.css')
_SCRIPTS_DIR = _BASE_PATH.with_name('home_scripts')
_SCRIPT_BUNDLE = _SCRIPTS_DIR / 'home.bundle.js'


def _load_home_scripts() -> str:
    """Load the bundled home page script."""

    if not _SCRIPT_BUNDLE.exists():
        raise FileNotFoundError(
            f"Expected bundled home script at {_SCRIPT_BUNDLE}, but the file does not exist.",
        )

    return _SCRIPT_BUNDLE.read_text(encoding='utf-8')

HOME_TEMPLATE = _TEMPLATE_PATH.read_text(encoding='utf-8')
HOME_STYLES = _STYLES_PATH.read_text(encoding='utf-8')
HOME_SCRIPTS = _load_home_scripts()

__all__ = [
    "HOME_TEMPLATE",
    "HOME_STYLES",
    "HOME_SCRIPTS",
]
