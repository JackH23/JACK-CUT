"""Home page template assets."""

from __future__ import annotations

from pathlib import Path

_BASE_PATH = Path(__file__).resolve()
_TEMPLATE_PATH = _BASE_PATH.with_suffix('.html')
_STYLES_PATH = _BASE_PATH.with_suffix('.css')
_SCRIPTS_DIR = _BASE_PATH.with_name('home_scripts')
_SCRIPT_PART_PATTERN = "[0-9][0-9]_home_content.js"


def _load_home_scripts() -> str:
    """Load and merge the home page scripts from their parts."""

    if not _SCRIPTS_DIR.exists():
        raise FileNotFoundError(
            f"Expected home scripts in {_SCRIPTS_DIR}, but the directory does not exist.",
        )

    script_parts = sorted(_SCRIPTS_DIR.glob(_SCRIPT_PART_PATTERN))

    if not script_parts:
        raise FileNotFoundError(
            f"Expected one or more script parts matching {_SCRIPT_PART_PATTERN} in {_SCRIPTS_DIR},"
            " but none were found.",
        )

    merged_scripts = "\n".join(part.read_text(encoding='utf-8') for part in script_parts)
    return f"{merged_scripts}\n"

HOME_TEMPLATE = _TEMPLATE_PATH.read_text(encoding='utf-8')
HOME_STYLES = _STYLES_PATH.read_text(encoding='utf-8')
HOME_SCRIPTS = _load_home_scripts()

__all__ = [
    "HOME_TEMPLATE",
    "HOME_STYLES",
    "HOME_SCRIPTS",
]
