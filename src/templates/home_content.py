"""Home page template assets."""

from __future__ import annotations

from pathlib import Path

_BASE_PATH = Path(__file__).resolve()
_TEMPLATE_PATH = _BASE_PATH.with_suffix('.html')
_STYLES_PATH = _BASE_PATH.with_suffix('.css')
_SCRIPTS_DIR = _BASE_PATH.with_name('home_scripts')


def _load_home_scripts() -> str:
    """Load the home page scripts by concatenating the module files."""

    if not _SCRIPTS_DIR.exists():
        raise FileNotFoundError(
            f"Expected split script modules in {_SCRIPTS_DIR}, but the directory does not exist.",
        )

    script_paths = sorted(_SCRIPTS_DIR.glob('*.js'))
    if not script_paths:
        raise FileNotFoundError(
            f"No JavaScript modules were found in {_SCRIPTS_DIR}.",  # pragma: no cover - configuration guard
        )

    return "\n".join(path.read_text(encoding='utf-8') for path in script_paths) + "\n"

HOME_TEMPLATE = _TEMPLATE_PATH.read_text(encoding='utf-8')
HOME_STYLES = _STYLES_PATH.read_text(encoding='utf-8')
HOME_SCRIPTS = _load_home_scripts()

__all__ = [
    "HOME_TEMPLATE",
    "HOME_STYLES",
    "HOME_SCRIPTS",
]
