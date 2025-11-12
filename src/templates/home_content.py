"""Home page template assets."""

from __future__ import annotations

from pathlib import Path

_BASE_PATH = Path(__file__).resolve()
_TEMPLATE_PATH = _BASE_PATH.with_suffix('.html')
_STYLES_PATH = _BASE_PATH.with_suffix('.css')
_SCRIPTS_DIR = _BASE_PATH.with_name('home_scripts')
_SCRIPT_BUNDLE = _SCRIPTS_DIR / 'home.bundle.js'
_SCRIPT_MODULES = [
    _SCRIPTS_DIR / 'modules' / 'foundation_and_upload.js',
    _SCRIPTS_DIR / 'modules' / 'timeline_management.js',
    _SCRIPTS_DIR / 'modules' / 'overlay_controls.js',
    _SCRIPTS_DIR / 'modules' / 'media_preview_and_playback.js',
    _SCRIPTS_DIR / 'modules' / 'export_workflow.js',
]


def _load_home_scripts() -> str:
    """Load the home page script from individual modules."""

    missing_modules = [str(path) for path in _SCRIPT_MODULES if not path.exists()]

    if missing_modules:
        if _SCRIPT_BUNDLE.exists():
            return _SCRIPT_BUNDLE.read_text(encoding='utf-8')

        missing = ', '.join(missing_modules)
        raise FileNotFoundError(
            f"Expected home script modules at: {missing}. None of the module files were found.",
        )

    return '\n\n'.join(path.read_text(encoding='utf-8') for path in _SCRIPT_MODULES)

HOME_TEMPLATE = _TEMPLATE_PATH.read_text(encoding='utf-8')
HOME_STYLES = _STYLES_PATH.read_text(encoding='utf-8')
HOME_SCRIPTS = _load_home_scripts()

__all__ = [
    "HOME_TEMPLATE",
    "HOME_STYLES",
    "HOME_SCRIPTS",
]
