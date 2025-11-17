"""Home page template assets."""

from __future__ import annotations

from pathlib import Path

_BASE_PATH = Path(__file__).resolve()
_TEMPLATE_PATH = _BASE_PATH.with_suffix('.html')
_STYLES_PATH = _BASE_PATH.with_suffix('.css')
_SCRIPTS_DIR = _BASE_PATH.with_name('home_scripts')
_SCRIPT_PARTS = [
    _SCRIPTS_DIR / 'home_media_and_overlay.js',
    _SCRIPTS_DIR / 'home_animation_and_export.js',
    _SCRIPTS_DIR / 'home_preview_and_canvas.js',
    _SCRIPTS_DIR / 'home_timeline_and_upload.js',
]


def _load_home_scripts() -> str:
    """Load and merge home page scripts from individual parts."""

    if not _SCRIPTS_DIR.exists():
        raise FileNotFoundError(
            f"Expected home scripts in {_SCRIPTS_DIR}, but the directory does not exist.",
        )

    missing_parts = [path for path in _SCRIPT_PARTS if not path.exists()]
    if missing_parts:
        missing_labels = ", ".join(path.name for path in missing_parts)
        raise FileNotFoundError(
            "Expected merged scripts to be split across the following files: "
            f"{missing_labels}."
        )

    merged_scripts = [
        path.read_text(encoding='utf-8').rstrip() for path in _SCRIPT_PARTS
    ]

    return "\n".join(merged_scripts) + "\n"

HOME_TEMPLATE = _TEMPLATE_PATH.read_text(encoding='utf-8')
HOME_STYLES = _STYLES_PATH.read_text(encoding='utf-8')
HOME_SCRIPTS = _load_home_scripts()

__all__ = [
    "HOME_TEMPLATE",
    "HOME_STYLES",
    "HOME_SCRIPTS",
]
