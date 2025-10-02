"""Template exports for the Flask application."""

from __future__ import annotations

from .home import HOME_HTML, load_home_css
from .login import LOGIN_HTML
from .signup import SIGNUP_HTML

__all__ = ["HOME_HTML", "LOGIN_HTML", "SIGNUP_HTML", "load_home_css"]
