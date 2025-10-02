"""Home page header template."""

from textwrap import dedent

HEADER_TEMPLATE = dedent("""\
<header class="nav-bar">
            <div class="nav-brand">
                <span class="brand-icon">🎬</span>
                <span>Video Editor Pro</span>
            </div>
            <nav class="nav-actions">
                {% if username %}
                    <span style="color: var(--text-secondary); font-size: 0.95rem;">Hi, {{ username }} 👋</span>
                    <button type="button" class="export-button">Export video</button>
                    <a class="primary" href="{{ url_for('signout') }}">Sign Out</a>
                {% else %}
                    <a href="{{ url_for('login') }}">Log In</a>
                    <a class="primary" href="{{ url_for('signup') }}">Get Started</a>
                    <button type="button" class="export-button">Export video</button>
                {% endif %}
            </nav>
        </header>
""").strip()
