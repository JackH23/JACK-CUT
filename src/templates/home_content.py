"""Utilities for loading the home page template."""
from importlib import resources


def _load_home_html() -> str:
    """Load the home page HTML template from the package resources."""
    resource = resources.files(__package__).joinpath("home_content.html")
    return resource.read_text(encoding="utf-8")


HOME_HTML = _load_home_html()

__all__ = ["HOME_HTML"]
