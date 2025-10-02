"""Template exports for the Flask application."""

from .home import HOME_TEMPLATE, HOME_STYLES, HOME_SCRIPTS
from .login import LOGIN_HTML
from .signup import SIGNUP_HTML

__all__ = [
    "HOME_TEMPLATE",
    "HOME_STYLES",
    "HOME_SCRIPTS",
    "LOGIN_HTML",
    "SIGNUP_HTML",
]
