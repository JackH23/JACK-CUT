SIGNUP_HTML = '''
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sign Up • Video Editor Pro</title>
    <style>
        :root {
            color-scheme: dark;
            font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
            --bg: #050b1a;
            --card: rgba(12, 19, 36, 0.82);
            --card-border: rgba(148, 163, 184, 0.18);
            --text: #f8fafc;
            --text-soft: #e0e7ff;
            --text-muted: rgba(203, 213, 225, 0.85);
            --accent: #f472b6;
            --accent-strong: #7c3aed;
            --accent-cool: #38bdf8;
            --success: rgba(74, 222, 128, 0.85);
            --error: rgba(248, 113, 113, 0.9);
            --radius-lg: 32px;
            --radius-md: 20px;
            --radius-sm: 12px;
            --shadow: 0 44px 120px rgba(2, 6, 23, 0.5);
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
                radial-gradient(120% 140% at 0% 10%, rgba(244, 114, 182, 0.32), transparent 65%),
                radial-gradient(140% 140% at 100% 0%, rgba(56, 189, 248, 0.28), transparent 70%),
                radial-gradient(150% 180% at 50% 120%, rgba(124, 58, 237, 0.26), transparent 75%),
                var(--bg);
            color: var(--text);
            padding: clamp(16px, 5vw, 52px);
        }

        .shell {
            width: min(1100px, 100%);
            display: grid;
            grid-template-columns: minmax(320px, 420px) minmax(0, 0.95fr);
            gap: clamp(24px, 5vw, 52px);
            background: rgba(10, 17, 32, 0.76);
            border: 1px solid rgba(148, 163, 184, 0.22);
            border-radius: clamp(24px, 5vw, 36px);
            padding: clamp(28px, 5vw, 48px);
            box-shadow: var(--shadow);
            backdrop-filter: blur(18px);
        }

        .card {
            background: var(--card);
            border-radius: var(--radius-lg);
            border: 1px solid var(--card-border);
            padding: clamp(28px, 4vw, 36px);
            display: flex;
            flex-direction: column;
            gap: 24px;
            box-shadow: inset 0 0 0 1px rgba(244, 114, 182, 0.1);
        }

        .card__header {
            display: grid;
            gap: 12px;
        }

        .card__badge {
            width: fit-content;
            padding: 8px 16px;
            border-radius: 999px;
            background: rgba(244, 114, 182, 0.24);
            border: 1px solid rgba(244, 114, 182, 0.32);
            color: rgba(255, 228, 255, 0.9);
            font-size: 0.8rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            font-weight: 600;
        }

        .card__title {
            margin: 0;
            font-size: 1.9rem;
            font-weight: 600;
        }

        .card__subtitle {
            margin: 0;
            color: var(--text-muted);
            line-height: 1.55;
        }

        .card__progress {
            display: flex;
            align-items: center;
            gap: 10px;
            color: rgba(203, 213, 225, 0.75);
            font-size: 0.9rem;
        }

        .card__progress-bar {
            flex: 1;
            height: 6px;
            border-radius: 999px;
            background: rgba(148, 163, 184, 0.3);
            position: relative;
            overflow: hidden;
        }

        .card__progress-bar::after {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(90deg, rgba(244, 114, 182, 0.9), rgba(124, 58, 237, 0.85));
            transform: scaleX(0.95);
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
            color: rgba(244, 244, 255, 0.9);
            letter-spacing: 0.02em;
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
            background: rgba(15, 23, 42, 0.86);
            color: var(--text);
            font-size: 1rem;
            transition: border 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
        }

        .input input:focus {
            outline: none;
            border-color: rgba(244, 114, 182, 0.65);
            box-shadow: 0 0 0 3px rgba(244, 114, 182, 0.22);
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
            background: rgba(15, 23, 42, 0.72);
            color: rgba(255, 228, 255, 0.95);
            font-weight: 600;
            font-size: 0.8rem;
            cursor: pointer;
            transition: background 0.2s ease, border 0.2s ease;
        }

        .input--password button:hover,
        .input--password button:focus-visible {
            outline: none;
            background: rgba(244, 114, 182, 0.24);
            border-color: rgba(244, 114, 182, 0.36);
        }

        .card__hint {
            font-size: 0.9rem;
            color: rgba(244, 244, 255, 0.65);
        }

        .error {
            color: var(--error);
            background: rgba(248, 113, 113, 0.16);
            border-radius: var(--radius-md);
            border: 1px solid rgba(248, 113, 113, 0.28);
            padding: 12px 14px;
            font-weight: 500;
        }

        .submit {
            padding: 14px 20px;
            border-radius: var(--radius-md);
            border: none;
            background: linear-gradient(135deg, rgba(244, 114, 182, 0.95), rgba(124, 58, 237, 0.9));
            color: #0b1020;
            font-weight: 600;
            font-size: 1rem;
            cursor: pointer;
            box-shadow: 0 26px 54px rgba(244, 114, 182, 0.28);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .submit:hover {
            transform: translateY(-2px);
            box-shadow: 0 32px 60px rgba(244, 114, 182, 0.32);
        }

        .card__footer {
            margin-top: auto;
            display: grid;
            gap: 12px;
            font-size: 0.95rem;
            color: rgba(244, 244, 255, 0.78);
            text-align: center;
        }

        .card__footer a {
            color: rgba(244, 114, 182, 0.95);
            text-decoration: none;
            font-weight: 600;
        }

        .card__footer a:hover {
            text-decoration: underline;
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
            background: linear-gradient(135deg, rgba(244, 114, 182, 0.55), rgba(56, 189, 248, 0.52));
            box-shadow: 0 18px 40px rgba(244, 114, 182, 0.3);
            font-size: 24px;
        }

        .preview__nav a {
            color: var(--text-muted);
            text-decoration: none;
            font-weight: 500;
            padding: 10px 16px;
            border-radius: var(--radius-sm);
            border: 1px solid transparent;
            background: rgba(15, 23, 42, 0.58);
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
            background: rgba(56, 189, 248, 0.22);
            border: 1px solid rgba(56, 189, 248, 0.3);
            color: rgba(190, 242, 255, 0.95);
            font-size: 0.8rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            font-weight: 600;
        }

        .preview__headline {
            margin: 0;
            font-size: clamp(2rem, 4.5vw, 2.8rem);
            letter-spacing: -0.02em;
        }

        .preview__description {
            margin: 0;
            color: var(--text-muted);
            line-height: 1.7;
            font-size: 1.05rem;
        }

        .preview__grid {
            display: grid;
            gap: 18px;
        }

        .preview__card {
            padding: 20px 22px;
            border-radius: var(--radius-md);
            background: rgba(8, 13, 28, 0.85);
            border: 1px solid rgba(148, 163, 184, 0.24);
            display: grid;
            gap: 8px;
        }

        .preview__card strong {
            font-size: 1.05rem;
        }

        .preview__card span {
            color: var(--text-muted);
            line-height: 1.5;
        }

        .preview__steps {
            display: grid;
            gap: 12px;
            margin: 0;
            padding: 0;
            list-style: none;
        }

        .preview__steps li {
            display: flex;
            align-items: center;
            gap: 12px;
            color: var(--text-muted);
            font-size: 0.95rem;
        }

        .preview__steps span {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: grid;
            place-items: center;
            background: rgba(244, 114, 182, 0.24);
            color: rgba(255, 228, 255, 0.9);
            font-weight: 600;
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

            .preview__grid {
                text-align: left;
            }

            .preview__steps li {
                justify-content: center;
                text-align: left;
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
        <main class="card" aria-labelledby="signup-title">
            <div class="card__header">
                <span class="card__badge">Create workspace</span>
                <div class="card__progress" aria-hidden="true">
                    <span>Step 2 of 2</span>
                    <div class="card__progress-bar"></div>
                </div>
                <h1 class="card__title" id="signup-title">Let’s get you editing</h1>
                <p class="card__subtitle">Set up your account in seconds and unlock collaborative timelines, responsive previews and project sharing.</p>
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
                    <label for="email">Email</label>
                    <div class="input">
                        <input type="email" id="email" name="email" autocomplete="email" required>
                    </div>
                </div>
                <div class="field">
                    <label for="password">Password</label>
                    <div class="input input--password">
                        <input type="password" id="password" name="password" autocomplete="new-password" required>
                        <button type="button" id="toggle-password" aria-controls="password" aria-pressed="false">Show</button>
                    </div>
                </div>
                <p class="card__hint">By creating an account you accept our community guidelines and privacy commitment.</p>
                <button class="submit" type="submit">Create account</button>
            </form>
            <div class="card__footer">
                <span>Already a member? <a href="{{ url_for('login') }}">Log in here</a></span>
                <a href="{{ url_for('home') }}">Return to the product tour</a>
            </div>
        </main>
        <section class="preview" aria-label="What’s included">
            <div class="preview__nav">
                <div class="brand">
                    <div class="brand__icon" aria-hidden="true">🎬</div>
                    <span>Video Editor Pro</span>
                </div>
                <a href="{{ url_for('home') }}">Back to home</a>
            </div>
            <div class="preview__content">
                <span class="preview__badge">All plans include</span>
                <h2 class="preview__headline">Everything you need to craft cinematic stories.</h2>
                <p class="preview__description">Collaborate in real time, automate color matching and deliver across every platform with streamlined controls and a calm, modern workspace.</p>
                <div class="preview__grid">
                    <article class="preview__card">
                        <strong>Team-ready out of the box</strong>
                        <span>Invite teammates, set granular roles and stay secure with watermarking and review approvals.</span>
                    </article>
                    <article class="preview__card">
                        <strong>Smart automation</strong>
                        <span>Scene detection, auto subtitles and AI-suggested edits keep your timeline organised.</span>
                    </article>
                    <ul class="preview__steps">
                        <li><span>01</span> Download the desktop app for macOS or Windows.</li>
                        <li><span>02</span> Connect your storage or cloud libraries in a click.</li>
                        <li><span>03</span> Share projects instantly with secure collaboration links.</li>
                    </ul>
                </div>
            </div>
        </section>
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
