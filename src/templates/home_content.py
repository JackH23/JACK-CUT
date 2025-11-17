"""Home page template assets."""

from __future__ import annotations

from pathlib import Path

_BASE_PATH = Path(__file__).resolve()
_TEMPLATE_PATH = _BASE_PATH.with_suffix('.html')
_STYLES_PATH = _BASE_PATH.with_suffix('.css')
_SCRIPTS_DIR = _BASE_PATH.with_name('home_scripts')
_SCRIPTS_PATH = _SCRIPTS_DIR / 'home_content.js'


def _load_home_scripts() -> str:
    """Load the merged home page script."""

    if not _SCRIPTS_DIR.exists():
        raise FileNotFoundError(
            f"Expected home scripts in {_SCRIPTS_DIR}, but the directory does not exist.",
        )

    if not _SCRIPTS_PATH.exists():
        raise FileNotFoundError(
            f"Expected merged script at {_SCRIPTS_PATH}, but the file does not exist.",
        )

    return _SCRIPTS_PATH.read_text(encoding='utf-8') + "\n"

HOME_TEMPLATE = _TEMPLATE_PATH.read_text(encoding='utf-8')
HOME_STYLES = _STYLES_PATH.read_text(encoding='utf-8')
HOME_SCRIPTS = _load_home_scripts()

__all__ = [
    "HOME_TEMPLATE",
    "HOME_STYLES",
    "HOME_SCRIPTS",
]
