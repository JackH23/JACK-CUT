LOGIN_HTML = '''
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Login • Video Editor Pro</title>
    <style>
        :root {
            color-scheme: dark;
            font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
            --bg: #050b1a;
            --card: rgba(12, 19, 36, 0.85);
            --card-border: rgba(148, 163, 184, 0.18);
            --text: #f8fafc;
            --text-soft: #cbd5f5;
            --accent: #60a5fa;
            --accent-strong: #7c3aed;
            --warning: rgba(248, 113, 113, 0.85);
            --error-bg: rgba(248, 113, 113, 0.14);
            --radius-lg: 32px;
            --radius-md: 20px;
            --radius-sm: 12px;
            --shadow: 0 40px 120px rgba(2, 6, 23, 0.5);
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background:
                radial-gradient(120% 140% at 0% 0%, rgba(96, 165, 250, 0.25), transparent 65%),
                radial-gradient(140% 140% at 100% 0%, rgba(124, 58, 237, 0.34), transparent 75%),
                radial-gradient(160% 200% at 50% 120%, rgba(244, 114, 182, 0.18), transparent 80%),
                var(--bg);
            color: var(--text);
            padding: clamp(16px, 5vw, 52px);
        }

        .shell {
            width: min(1100px, 100%);
            display: grid;
            grid-template-columns: minmax(0, 0.9fr) minmax(320px, 420px);
            gap: clamp(24px, 5vw, 52px);
            background: rgba(10, 17, 32, 0.72);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: clamp(24px, 5vw, 36px);
            padding: clamp(28px, 5vw, 48px);
            box-shadow: var(--shadow);
            backdrop-filter: blur(18px);
        }

        .preview {
            display: flex;
            flex-direction: column;
            gap: clamp(24px, 4vw, 40px);
            justify-content: space-between;
        }

        .preview__nav {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .brand {
            display: flex;
            align-items: center;
            gap: 14px;
            font-weight: 600;
            letter-spacing: 0.04em;
        }

        .brand__icon {
            width: 48px;
            height: 48px;
            border-radius: var(--radius-sm);
            display: grid;
            place-items: center;
            background: linear-gradient(135deg, rgba(96, 165, 250, 0.55), rgba(124, 58, 237, 0.55));
            box-shadow: 0 18px 40px rgba(124, 58, 237, 0.32);
            font-size: 24px;
        }

        .preview__nav a {
            color: var(--text-soft);
            text-decoration: none;
            font-weight: 500;
            padding: 10px 16px;
            border-radius: var(--radius-sm);
            border: 1px solid transparent;
            background: rgba(15, 23, 42, 0.55);
            transition: transform 0.2s ease, border 0.2s ease, color 0.2s ease;
        }

        .preview__nav a:hover,
        .preview__nav a:focus-visible {
            color: var(--text);
            border-color: rgba(148, 163, 184, 0.32);
            transform: translateY(-2px);
            outline: none;
        }

        .preview__content {
            display: grid;
            gap: clamp(20px, 3vw, 32px);
        }

        .preview__badge {
            align-self: flex-start;
            padding: 8px 16px;
            border-radius: 999px;
            font-size: 0.8rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            background: rgba(96, 165, 250, 0.2);
            border: 1px solid rgba(148, 163, 184, 0.26);
            color: rgba(191, 219, 254, 0.95);
        }

        .preview__headline {
            margin: 0;
            font-size: clamp(2rem, 4.5vw, 2.8rem);
            letter-spacing: -0.02em;
        }

        .preview__description {
            margin: 0;
            color: var(--text-soft);
            line-height: 1.7;
            font-size: 1.05rem;
        }

        .preview__highlights {
            display: grid;
            gap: 18px;
            margin: 0;
            padding: 0;
            list-style: none;
        }

        .preview__highlights li {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 12px;
            align-items: start;
            color: var(--text-soft);
        }

        .preview__icon {
            width: 40px;
            height: 40px;
            border-radius: 14px;
            display: grid;
            place-items: center;
            background: rgba(96, 165, 250, 0.2);
            color: rgba(191, 219, 254, 0.95);
        }

        .card {
            background: var(--card);
            border-radius: var(--radius-lg);
            border: 1px solid var(--card-border);
            padding: clamp(28px, 4vw, 36px);
            display: flex;
            flex-direction: column;
            gap: 24px;
            box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.08);
        }

        .card__header {
            display: grid;
            gap: 12px;
            text-align: left;
        }

        .card__title {
            margin: 0;
            font-size: 1.9rem;
            font-weight: 600;
        }

        .card__subtitle {
            margin: 0;
            color: var(--text-soft);
            line-height: 1.5;
        }

        .progress {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 0.9rem;
            color: rgba(203, 213, 225, 0.75);
        }

        .progress__bar {
            flex: 1;
            height: 6px;
            border-radius: 999px;
            background: rgba(148, 163, 184, 0.28);
            position: relative;
            overflow: hidden;
        }

        .progress__bar::after {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(90deg, rgba(96, 165, 250, 0.85), rgba(124, 58, 237, 0.75));
            transform: scaleX(0.5);
            transform-origin: left;
        }

        form {
            display: grid;
            gap: 18px;
        }

        .field {
            display: grid;
            gap: 8px;
        }

        .field label {
            font-size: 0.85rem;
            font-weight: 600;
            letter-spacing: 0.02em;
            color: rgba(226, 232, 240, 0.9);
        }

        .input {
            position: relative;
            display: flex;
            align-items: center;
        }

        .input input {
            width: 100%;
            padding: 14px 16px;
            border-radius: var(--radius-md);
            border: 1px solid rgba(148, 163, 184, 0.25);
            background: rgba(15, 23, 42, 0.85);
            color: var(--text);
            font-size: 1rem;
            transition: border 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
        }

        .input input:focus {
            outline: none;
            border-color: rgba(96, 165, 250, 0.65);
            box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.2);
            transform: translateY(-1px);
        }

        .input--password button {
            position: absolute;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            padding: 6px 12px;
            border-radius: 10px;
            border: 1px solid rgba(148, 163, 184, 0.24);
            background: rgba(15, 23, 42, 0.7);
            color: rgba(191, 219, 254, 0.95);
            font-weight: 600;
            font-size: 0.8rem;
            cursor: pointer;
            transition: background 0.2s ease, border 0.2s ease;
        }

        .input--password button:hover,
        .input--password button:focus-visible {
            outline: none;
            background: rgba(96, 165, 250, 0.2);
            border-color: rgba(148, 163, 184, 0.36);
        }

        .card__options {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
            font-size: 0.9rem;
            color: rgba(203, 213, 225, 0.75);
        }

        .card__options label {
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }

        .card__options input[type="checkbox"] {
            accent-color: rgba(96, 165, 250, 0.9);
            width: 18px;
            height: 18px;
        }

        .card__options a {
            color: rgba(191, 219, 254, 0.95);
            text-decoration: none;
            font-weight: 500;
        }

        .card__options a:hover {
            text-decoration: underline;
        }

        .submit {
            margin-top: 6px;
            padding: 14px 20px;
            border-radius: var(--radius-md);
            border: none;
            background: linear-gradient(135deg, rgba(96, 165, 250, 0.95), rgba(124, 58, 237, 0.9));
            color: #050b1a;
            font-weight: 600;
            font-size: 1rem;
            cursor: pointer;
            box-shadow: 0 22px 46px rgba(96, 165, 250, 0.28);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .submit:hover {
            transform: translateY(-2px);
            box-shadow: 0 28px 50px rgba(96, 165, 250, 0.32);
        }

        .error {
            color: var(--warning);
            background: var(--error-bg);
            border-radius: var(--radius-md);
            border: 1px solid rgba(248, 113, 113, 0.28);
            padding: 12px 14px;
            font-weight: 500;
        }

        .card__footer {
            margin-top: auto;
            display: grid;
            gap: 12px;
            font-size: 0.95rem;
            color: rgba(203, 213, 225, 0.8);
            text-align: center;
        }

        .card__footer a {
            color: rgba(191, 219, 254, 0.95);
            text-decoration: none;
            font-weight: 600;
        }

        .card__footer a:hover {
            text-decoration: underline;
        }

        @media (max-width: 960px) {
            .shell {
                grid-template-columns: 1fr;
                padding: clamp(24px, 6vw, 40px);
            }

            .preview {
                order: 2;
                text-align: center;
            }

            .preview__badge {
                margin: 0 auto;
            }

            .preview__highlights li {
                justify-items: center;
                text-align: center;
            }

            .preview__nav {
                justify-content: center;
            }
        }

        @media (max-width: 600px) {
            body {
                padding: 16px;
            }

            .card {
                padding: 24px;
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
    <div class="shell">
        <section class="preview" aria-label="Highlights">
            <div class="preview__nav">
                <div class="brand">
                    <div class="brand__icon" aria-hidden="true">🎬</div>
                    <span>Video Editor Pro</span>
                </div>
                <a href="{{ url_for('home') }}">Back to home</a>
            </div>
            <div class="preview__content">
                <span class="preview__badge">Fresh redesign</span>
                <h1 class="preview__headline">Log in and reconnect with your creative flow.</h1>
                <p class="preview__description">Pick up your projects in seconds with synced timelines, favourites and a layout that keeps your essential tools ready from the first frame.</p>
                <ul class="preview__highlights">
                    <li>
                        <span class="preview__icon">⚡</span>
                        <span>Lightning-fast project search across every workspace.</span>
                    </li>
                    <li>
                        <span class="preview__icon">🎯</span>
                        <span>Smart resume remembers your last edit position automatically.</span>
                    </li>
                    <li>
                        <span class="preview__icon">🤝</span>
                        <span>Collaborative review threads keep feedback tidy and actionable.</span>
                    </li>
                </ul>
            </div>
        </section>
        <main class="card" aria-labelledby="login-title">
            <div class="card__header">
                <div class="progress" aria-hidden="true">
                    <span>Step 1 of 2</span>
                    <div class="progress__bar"></div>
                </div>
                <h1 class="card__title" id="login-title">Welcome back</h1>
                <p class="card__subtitle">Sign in to continue editing and keep your team aligned.</p>
            </div>
            {% if error %}
                <div class="error" role="alert">{{ error }}</div>
            {% endif %}
            <form method="post" novalidate>
                <div class="field">
                    <label for="username">Username</label>
                    <div class="input">
                        <input type="text" id="username" name="username" autocomplete="username" required>
                    </div>
                </div>
                <div class="field">
                    <label for="password">Password</label>
                    <div class="input input--password">
                        <input type="password" id="password" name="password" autocomplete="current-password" required>
                        <button type="button" id="toggle-password" aria-controls="password" aria-pressed="false">Show</button>
                    </div>
                </div>
                <div class="card__options">
                    <label>
                        <input type="checkbox" name="remember" value="1"> Keep me signed in
                    </label>
                    <a href="#" aria-disabled="true" onclick="return false;">Forgot password?</a>
                </div>
                <button class="submit" type="submit">Log in</button>
            </form>
            <div class="card__footer">
                <span>Need an account? <a href="{{ url_for('signup') }}">Create one for free</a></span>
                <a href="{{ url_for('home') }}">Browse the product tour</a>
            </div>
        </main>
    </div>
    <script>
        const togglePasswordButton = document.getElementById('toggle-password');
        const passwordInput = document.getElementById('password');

        if (togglePasswordButton && passwordInput) {
            togglePasswordButton.addEventListener('click', () => {
                const isPassword = passwordInput.getAttribute('type') === 'password';
                passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
                togglePasswordButton.textContent = isPassword ? 'Hide' : 'Show';
                togglePasswordButton.setAttribute('aria-pressed', String(isPassword));
            });
        }
    </script>
</body>
</html>
'''
