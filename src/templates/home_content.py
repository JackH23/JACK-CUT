HOME_HTML = '''
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Video Editor Pro</title>
    <style>
        :root {
            color-scheme: dark;
            font-family: 'Inter', 'Segoe UI', Roboto, Arial, sans-serif;
            --bg-1: #050b1a;
            --bg-2: #0d1530;
            --bg-3: rgba(13, 21, 48, 0.75);
            --card: rgba(15, 23, 42, 0.82);
            --card-border: rgba(148, 163, 184, 0.18);
            --card-border-strong: rgba(148, 163, 184, 0.32);
            --text: #f8fafc;
            --text-soft: #c7d2fe;
            --text-muted: rgba(203, 213, 225, 0.85);
            --accent: #60a5fa;
            --accent-strong: #7c3aed;
            --accent-soft: rgba(96, 165, 250, 0.16);
            --radius-lg: 28px;
            --radius-md: 20px;
            --radius-sm: 12px;
            --shadow-glow: 0 30px 80px rgba(15, 23, 42, 0.55);
            --shadow-card: 0 20px 50px rgba(15, 23, 42, 0.45);
            --shadow-hover: 0 24px 40px rgba(124, 58, 237, 0.35);
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            min-height: 100vh;
            background:
                radial-gradient(110% 110% at 10% 10%, rgba(96, 165, 250, 0.28), transparent 65%),
                radial-gradient(140% 120% at 85% 0%, rgba(124, 58, 237, 0.32), transparent 70%),
                radial-gradient(120% 160% at 50% 120%, rgba(248, 113, 113, 0.18), transparent 75%),
                var(--bg-1);
            color: var(--text);
            display: flex;
            justify-content: center;
            padding: clamp(18px, 3vw, 36px);
        }

        .app-shell {
            width: min(1160px, 100%);
            display: grid;
            gap: clamp(24px, 4vw, 40px);
        }

        .nav {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: clamp(18px, 3vw, 28px);
            border-radius: var(--radius-lg);
            background: linear-gradient(135deg, rgba(15, 23, 42, 0.88), rgba(15, 23, 42, 0.65));
            border: 1px solid var(--card-border);
            box-shadow: var(--shadow-glow);
            position: sticky;
            top: clamp(16px, 3vw, 24px);
            backdrop-filter: blur(16px);
            z-index: 2;
        }

        .nav__brand {
            display: flex;
            align-items: center;
            gap: 16px;
            font-weight: 600;
            font-size: 1.1rem;
            letter-spacing: 0.04em;
        }

        .nav__icon {
            display: grid;
            place-items: center;
            width: 48px;
            height: 48px;
            border-radius: var(--radius-sm);
            background: linear-gradient(135deg, rgba(96, 165, 250, 0.4), rgba(124, 58, 237, 0.5));
            box-shadow: 0 18px 38px rgba(96, 165, 250, 0.28);
            font-size: 26px;
        }

        .nav__links {
            display: flex;
            align-items: center;
            gap: 18px;
            flex-wrap: wrap;
        }

        .nav__links a {
            color: var(--text-muted);
            text-decoration: none;
            font-weight: 500;
            padding: 10px 16px;
            border-radius: var(--radius-sm);
            background: rgba(15, 23, 42, 0.55);
            border: 1px solid transparent;
            transition: transform 0.2s ease, border 0.2s ease, color 0.2s ease, background 0.2s ease;
        }

        .nav__links a:hover,
        .nav__links a:focus-visible {
            color: var(--text);
            border-color: rgba(148, 163, 184, 0.28);
            transform: translateY(-2px);
            outline: none;
        }

        .nav__links a.cta {
            background: linear-gradient(135deg, rgba(96, 165, 250, 0.95), rgba(124, 58, 237, 0.9));
            color: #050b1a;
            font-weight: 600;
            box-shadow: var(--shadow-hover);
        }

        .nav__account {
            display: flex;
            align-items: center;
            gap: 14px;
        }

        .nav__account a {
            text-decoration: none;
            font-weight: 600;
            padding: 10px 18px;
            border-radius: var(--radius-sm);
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.22);
            color: var(--text-muted);
            transition: transform 0.2s ease, border 0.2s ease, color 0.2s ease, background 0.2s ease;
        }

        .nav__account a:hover,
        .nav__account a:focus-visible {
            color: var(--text);
            border-color: rgba(148, 163, 184, 0.36);
            transform: translateY(-2px);
            outline: none;
        }

        .nav__account a.cta {
            background: linear-gradient(135deg, rgba(96, 165, 250, 0.95), rgba(124, 58, 237, 0.9));
            color: #050b1a;
            box-shadow: var(--shadow-hover);
            border: none;
        }

        .chip {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 8px 14px;
            border-radius: 999px;
            background: rgba(15, 23, 42, 0.75);
            border: 1px solid rgba(148, 163, 184, 0.24);
            box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.1);
        }

        .chip__avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: grid;
            place-items: center;
            background: linear-gradient(135deg, rgba(96, 165, 250, 0.65), rgba(124, 58, 237, 0.6));
            color: #050b1a;
            font-weight: 700;
        }

        .chip__meta {
            display: grid;
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: rgba(203, 213, 225, 0.75);
        }

        .chip__name {
            text-transform: none;
            letter-spacing: 0.02em;
            font-size: 0.95rem;
            color: var(--text);
        }

        .main {
            display: grid;
            gap: clamp(28px, 5vw, 52px);
        }

        .hero {
            position: relative;
            border-radius: var(--radius-lg);
            background: linear-gradient(130deg, rgba(15, 23, 42, 0.92), rgba(15, 23, 42, 0.76));
            border: 1px solid var(--card-border);
            overflow: hidden;
            padding: clamp(32px, 6vw, 60px);
            box-shadow: var(--shadow-glow);
        }

        .hero::after {
            content: '';
            position: absolute;
            inset: 0;
            background:
                radial-gradient(120% 120% at 15% 10%, rgba(96, 165, 250, 0.18), transparent 60%),
                radial-gradient(100% 100% at 85% 20%, rgba(124, 58, 237, 0.18), transparent 65%);
            pointer-events: none;
        }

        .hero__grid {
            position: relative;
            display: grid;
            gap: clamp(28px, 4vw, 48px);
            grid-template-columns: minmax(0, 1.1fr) minmax(260px, 0.9fr);
            align-items: center;
        }

        .hero__intro {
            display: grid;
            gap: 20px;
        }

        .hero__badge {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            width: fit-content;
            padding: 8px 16px;
            border-radius: 999px;
            background: rgba(96, 165, 250, 0.18);
            color: rgba(191, 219, 254, 0.95);
            font-size: 0.85rem;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .hero__title {
            margin: 0;
            font-size: clamp(2.4rem, 5vw, 3.6rem);
            letter-spacing: -0.02em;
            line-height: 1.1;
        }

        .hero__text {
            margin: 0;
            font-size: clamp(1.05rem, 2.4vw, 1.2rem);
            color: var(--text-muted);
            line-height: 1.7;
        }

        .hero__cta {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
        }

        .hero__cta a {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 14px 26px;
            border-radius: var(--radius-md);
            font-weight: 600;
            text-decoration: none;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .hero__cta a.primary {
            background: linear-gradient(135deg, rgba(96, 165, 250, 1), rgba(124, 58, 237, 0.92));
            color: #050b1a;
            box-shadow: var(--shadow-hover);
        }

        .hero__cta a.secondary {
            background: rgba(15, 23, 42, 0.72);
            border: 1px solid rgba(148, 163, 184, 0.25);
            color: var(--text);
        }

        .hero__cta a:hover {
            transform: translateY(-3px);
        }

        .hero__panel {
            position: relative;
            border-radius: var(--radius-md);
            background: rgba(8, 13, 28, 0.9);
            border: 1px solid rgba(148, 163, 184, 0.2);
            padding: 24px;
            display: grid;
            gap: 18px;
            box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.08);
        }

        .hero__panel h3 {
            margin: 0;
            font-size: 1.1rem;
            font-weight: 600;
        }

        .hero__panel ul {
            margin: 0;
            padding: 0;
            list-style: none;
            display: grid;
            gap: 12px;
        }

        .hero__panel li {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 12px;
            align-items: start;
            color: var(--text-muted);
            font-size: 0.95rem;
        }

        .hero__panel span.icon {
            display: grid;
            place-items: center;
            width: 34px;
            height: 34px;
            border-radius: 12px;
            background: rgba(96, 165, 250, 0.16);
            color: rgba(191, 219, 254, 0.95);
        }

        .section {
            display: grid;
            gap: 24px;
            background: var(--card);
            border-radius: var(--radius-lg);
            border: 1px solid var(--card-border);
            padding: clamp(28px, 4vw, 40px);
            box-shadow: var(--shadow-card);
        }

        .section__header {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .section__header span {
            font-size: 0.85rem;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: rgba(203, 213, 225, 0.65);
        }

        .section__header h2 {
            margin: 0;
            font-size: clamp(1.8rem, 4vw, 2.4rem);
        }

        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: clamp(18px, 3vw, 26px);
        }

        .feature-card {
            display: grid;
            gap: 14px;
            padding: 22px;
            border-radius: var(--radius-md);
            background: rgba(8, 13, 28, 0.88);
            border: 1px solid rgba(148, 163, 184, 0.2);
            transition: transform 0.2s ease, border 0.2s ease;
        }

        .feature-card:hover {
            transform: translateY(-4px);
            border-color: rgba(96, 165, 250, 0.4);
        }

        .feature-icon {
            width: 46px;
            height: 46px;
            border-radius: 16px;
            display: grid;
            place-items: center;
            background: rgba(96, 165, 250, 0.16);
            color: var(--text);
            font-size: 1.3rem;
        }

        .feature-card h3 {
            margin: 0;
            font-size: 1.1rem;
        }

        .feature-card p {
            margin: 0;
            color: var(--text-muted);
            line-height: 1.6;
        }

        .workflow {
            display: grid;
            gap: 20px;
        }

        .workflow__steps {
            display: grid;
            gap: 18px;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        }

        .step-card {
            border-radius: var(--radius-md);
            border: 1px solid rgba(148, 163, 184, 0.22);
            background: rgba(8, 13, 28, 0.85);
            padding: 22px;
            display: grid;
            gap: 12px;
            position: relative;
            overflow: hidden;
        }

        .step-card::after {
            content: attr(data-step);
            position: absolute;
            top: 16px;
            right: 16px;
            font-size: 0.75rem;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: rgba(148, 163, 184, 0.55);
        }

        .step-card strong {
            font-size: 1.05rem;
        }

        .step-card span {
            color: var(--text-muted);
            line-height: 1.6;
        }

        .community {
            display: grid;
            gap: 24px;
            grid-template-columns: minmax(0, 0.9fr) minmax(260px, 0.6fr);
            align-items: center;
        }

        .community__quote {
            border-radius: var(--radius-md);
            background: rgba(8, 13, 28, 0.88);
            border: 1px solid rgba(148, 163, 184, 0.2);
            padding: clamp(24px, 4vw, 32px);
            display: grid;
            gap: 20px;
            position: relative;
        }

        .community__quote::before {
            content: '"';
            position: absolute;
            top: 16px;
            left: 18px;
            font-size: 4rem;
            color: rgba(96, 165, 250, 0.16);
        }

        .community__quote p {
            margin: 0;
            color: var(--text-muted);
            line-height: 1.7;
            font-size: 1.05rem;
        }

        .community__author {
            display: flex;
            align-items: center;
            gap: 14px;
        }

        .community__avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            display: grid;
            place-items: center;
            background: rgba(96, 165, 250, 0.22);
            font-weight: 700;
            color: rgba(191, 219, 254, 1);
        }

        .community__meta {
            display: grid;
            gap: 4px;
        }

        .community__meta strong {
            font-size: 1rem;
        }

        .community__meta span {
            color: rgba(148, 163, 184, 0.85);
            font-size: 0.9rem;
        }

        .community__stats {
            border-radius: var(--radius-md);
            background: rgba(15, 23, 42, 0.78);
            border: 1px solid rgba(96, 165, 250, 0.25);
            padding: 24px;
            display: grid;
            gap: 18px;
        }

        .community__stats h3 {
            margin: 0;
            font-size: 1.05rem;
        }

        .community__list {
            margin: 0;
            padding: 0;
            list-style: none;
            display: grid;
            gap: 12px;
        }

        .community__list li {
            display: flex;
            align-items: center;
            justify-content: space-between;
            color: var(--text-muted);
        }

        .cta {
            border-radius: var(--radius-lg);
            background: linear-gradient(135deg, rgba(96, 165, 250, 0.18), rgba(124, 58, 237, 0.18));
            border: 1px solid rgba(148, 163, 184, 0.22);
            padding: clamp(32px, 4vw, 42px);
            text-align: center;
            display: grid;
            gap: 18px;
        }

        .cta h2 {
            margin: 0;
            font-size: clamp(2rem, 4vw, 2.6rem);
        }

        .cta p {
            margin: 0;
            color: var(--text-muted);
            font-size: 1.05rem;
        }

        .cta__actions {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            justify-content: center;
        }

        .cta__actions a {
            padding: 14px 26px;
            border-radius: var(--radius-md);
            text-decoration: none;
            font-weight: 600;
        }

        .cta__actions a.primary {
            background: linear-gradient(135deg, rgba(96, 165, 250, 0.95), rgba(124, 58, 237, 0.9));
            color: #050b1a;
            box-shadow: var(--shadow-hover);
        }

        .cta__actions a.secondary {
            border: 1px solid rgba(148, 163, 184, 0.25);
            color: var(--text);
            background: rgba(15, 23, 42, 0.7);
        }

        footer {
            text-align: center;
            font-size: 0.85rem;
            color: rgba(203, 213, 225, 0.65);
            padding-bottom: 12px;
        }

        @media (max-width: 1024px) {
            .nav {
                position: static;
            }

            .hero__grid,
            .community {
                grid-template-columns: 1fr;
            }

            .hero__panel {
                order: -1;
            }

            .nav__links {
                justify-content: center;
            }
        }

        @media (max-width: 720px) {
            body {
                padding: 16px;
            }

            .nav {
                flex-direction: column;
                align-items: stretch;
                gap: 18px;
            }

            .nav__links,
            .nav__account {
                justify-content: space-between;
            }

            .hero__cta {
                flex-direction: column;
                align-items: stretch;
            }

            .cta__actions {
                flex-direction: column;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
                scroll-behavior: auto !important;
            }
        }
    </style>
</head>
<body>
    <div class="app-shell">
        <header class="nav" aria-label="Primary navigation">
            <div class="nav__brand">
                <div class="nav__icon" aria-hidden="true">🎬</div>
                <span>Video Editor Pro</span>
            </div>
            <nav class="nav__links">
                <a href="#overview">Overview</a>
                <a href="#features">Features</a>
                <a href="#workflow">Workflow</a>
                <a href="#community">Community</a>
            </nav>
            <div class="nav__account">
                {% if username %}
                    <div class="chip">
                        <div class="chip__avatar">{{ username[0]|upper }}</div>
                        <div>
                            <span class="chip__meta">Signed in as</span>
                            <span class="chip__name">{{ username }}</span>
                        </div>
                    </div>
                    <a class="cta" href="{{ url_for('signout') }}">Sign out</a>
                {% else %}
                    <a href="{{ url_for('login') }}">Log in</a>
                    <a class="cta" href="{{ url_for('signup') }}">Get started</a>
                {% endif %}
            </div>
        </header>

        <main class="main">
            <section class="hero" id="overview">
                <div class="hero__grid">
                    <div class="hero__intro">
                        <span class="hero__badge">Crafted for storytellers</span>
                        <h1 class="hero__title">A cinematic studio that feels effortless from the first cut.</h1>
                        <p class="hero__text">Video Editor Pro combines powerful controls, adaptive automation and collaborative tooling to help you shape stories without the stress. Curate footage, fine-tune color, and deliver in record time from a workspace that delights on every screen.</p>
                        <div class="hero__cta">
                            {% if username %}
                                <a class="primary" href="#workflow">Explore the workflow</a>
                                <a class="secondary" href="{{ url_for('signout') }}">Sign out</a>
                            {% else %}
                                <a class="primary" href="{{ url_for('signup') }}">Start free trial</a>
                                <a class="secondary" href="{{ url_for('login') }}">View the demo</a>
                            {% endif %}
                        </div>
                    </div>
                    <aside class="hero__panel" aria-label="Quick stats">
                        <h3>What teams love</h3>
                        <ul>
                            <li>
                                <span class="icon">⚡</span>
                                <div>
                                    <strong>Real-time previews</strong>
                                    <div>GPU-accelerated scrubbing and instant playback even on remote sessions.</div>
                                </div>
                            </li>
                            <li>
                                <span class="icon">🎨</span>
                                <div>
                                    <strong>Color intelligence</strong>
                                    <div>Smart match suggestions keep multi-camera shoots perfectly aligned.</div>
                                </div>
                            </li>
                            <li>
                                <span class="icon">🤝</span>
                                <div>
                                    <strong>Collaborative timelines</strong>
                                    <div>Invite directors and producers to comment directly on keyframes.</div>
                                </div>
                            </li>
                        </ul>
                    </aside>
                </div>
            </section>

            <section class="section" id="features">
                <div class="section__header">
                    <span>Why editors switch</span>
                    <h2>Design that balances clarity and control</h2>
                </div>
                <div class="features">
                    <article class="feature-card">
                        <div class="feature-icon">🧭</div>
                        <h3>Guided navigation</h3>
                        <p>Context-aware panels keep essential tools within reach and hide what you do not need right now.</p>
                    </article>
                    <article class="feature-card">
                        <div class="feature-icon">✨</div>
                        <h3>Preset playground</h3>
                        <p>Experiment with cinematic looks, lens corrections and transitions in a distraction-free sandbox.</p>
                    </article>
                    <article class="feature-card">
                        <div class="feature-icon">📊</div>
                        <h3>Performance insights</h3>
                        <p>See render forecasts, export health and system load in one glance before you hit publish.</p>
                    </article>
                    <article class="feature-card">
                        <div class="feature-icon">🔐</div>
                        <h3>Secure collaboration</h3>
                        <p>Role-based permissions and shareable watermarking keep client revisions private.</p>
                    </article>
                </div>
            </section>

            <section class="section" id="workflow">
                <div class="section__header">
                    <span>From import to delivery</span>
                    <h2>Your workflow, organised and on-brand</h2>
                </div>
                <div class="workflow">
                    <div class="workflow__steps">
                        <div class="step-card" data-step="Step 1">
                            <strong>Import &amp; organise</strong>
                            <span>Drag-and-drop bulk footage or sync via cloud storage. Auto-tagging keeps everything findable.</span>
                        </div>
                        <div class="step-card" data-step="Step 2">
                            <strong>Edit with confidence</strong>
                            <span>Adaptive timelines and magnetised keyframes help you stay in rhythm while edits snap into place.</span>
                        </div>
                        <div class="step-card" data-step="Step 3">
                            <strong>Fine-tune polish</strong>
                            <span>Layer audio, grade shots, and preview LUTs with smart suggestions tailored to each clip.</span>
                        </div>
                        <div class="step-card" data-step="Step 4">
                            <strong>Deliver anywhere</strong>
                            <span>Export to every platform with shareable presets, QC warnings, and instant collaboration links.</span>
                        </div>
                    </div>
                </div>
            </section>

            <section class="section community" id="community" aria-label="Community spotlight">
                <div class="community__quote">
                    <p>“We switched the entire studio to Video Editor Pro and cut delivery time by half. The interface keeps our junior editors confident while giving senior artists the nuance they crave.”</p>
                    <div class="community__author">
                        <div class="community__avatar">LT</div>
                        <div class="community__meta">
                            <strong>Liv Thompson</strong>
                            <span>Head of Post Production, Northwave Studios</span>
                        </div>
                    </div>
                </div>
                <aside class="community__stats" aria-label="Customer highlights">
                    <h3>Trusted by creative teams</h3>
                    <ul class="community__list">
                        <li><span>18K+ active editors</span><span>🌍</span></li>
                        <li><span>120 countries represented</span><span>✈️</span></li>
                        <li><span>4.9/5 satisfaction score</span><span>⭐</span></li>
                        <li><span>35% faster delivery</span><span>⚡</span></li>
                    </ul>
                </aside>
            </section>

            <section class="cta" aria-label="Call to action">
                <h2>Ready to build your next signature cut?</h2>
                <p>Join thousands of editors crafting cinematic stories with a workspace that respects your flow.</p>
                <div class="cta__actions">
                    {% if username %}
                        <a class="primary" href="#workflow">Jump into the workflow</a>
                        <a class="secondary" href="{{ url_for('signout') }}">Switch account</a>
                    {% else %}
                        <a class="primary" href="{{ url_for('signup') }}">Create your account</a>
                        <a class="secondary" href="{{ url_for('login') }}">Already with us? Log in</a>
                    {% endif %}
                </div>
            </section>
        </main>

        <footer>
            © {{ 2024 }} Video Editor Pro. Built to keep storytellers in flow.
        </footer>
    </div>
</body>
</html>
'''
