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
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: stretch;
            justify-content: center;
            background:
                radial-gradient(110% 120% at 0% 0%, rgba(56, 189, 248, 0.25), transparent 65%),
                radial-gradient(120% 140% at 100% 0%, rgba(124, 58, 237, 0.32), transparent 75%),
                radial-gradient(180% 180% at 50% 140%, rgba(244, 114, 182, 0.24), transparent 75%),
                #0b1120;
            color: #f8fafc;
            padding: clamp(16px, 5vw, 48px);
        }

        .page {
            width: min(980px, 100%);
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
            gap: clamp(24px, 4vw, 48px);
            background: rgba(15, 23, 42, 0.72);
            border: 1px solid rgba(148, 163, 184, 0.18);
            border-radius: clamp(24px, 4vw, 36px);
            box-shadow: 0 30px 80px rgba(2, 6, 23, 0.55);
            backdrop-filter: blur(14px);
            padding: clamp(28px, 4vw, 48px);
        }

        .showcase {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            gap: 32px;
        }

        .showcase__header {
            display: grid;
            gap: 18px;
        }

        .showcase__badge {
            align-self: flex-start;
            padding: 6px 14px;
            border-radius: 999px;
            font-size: 0.75rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            font-weight: 600;
            background: linear-gradient(135deg, rgba(56, 189, 248, 0.35), rgba(124, 58, 237, 0.35));
            border: 1px solid rgba(148, 163, 184, 0.28);
            color: rgba(148, 198, 255, 0.95);
        }

        .showcase__title {
            font-size: clamp(1.9rem, 3.2vw, 2.6rem);
            margin: 0;
            font-weight: 700;
            letter-spacing: -0.02em;
        }

        .showcase__text {
            margin: 0;
            line-height: 1.6;
            color: #cbd5f5;
            font-size: 1.05rem;
        }

        .showcase__list {
            margin: 0;
            padding: 0;
            list-style: none;
            display: grid;
            gap: 18px;
        }

        .showcase__list li {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 12px;
            align-items: start;
            font-size: 0.95rem;
            color: #cbd5f5;
        }

        .showcase__icon {
            display: grid;
            place-items: center;
            width: 36px;
            height: 36px;
            border-radius: 12px;
            background: rgba(56, 189, 248, 0.15);
            color: rgba(148, 198, 255, 0.95);
            font-size: 18px;
        }

        .card {
            background: rgba(8, 13, 28, 0.82);
            border-radius: clamp(20px, 3vw, 28px);
            padding: clamp(28px, 3vw, 36px);
            border: 1px solid rgba(148, 163, 184, 0.18);
            box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.08);
            display: flex;
            flex-direction: column;
            gap: 24px;
        }

        .card__header {
            text-align: center;
            display: grid;
            gap: 14px;
        }

        .card__logo {
            width: 72px;
            height: 72px;
            border-radius: 20px;
            display: grid;
            place-items: center;
            margin: 0 auto;
            font-size: 36px;
            background: linear-gradient(135deg, rgba(124, 58, 237, 0.85), rgba(56, 189, 248, 0.78));
            box-shadow: 0 18px 40px rgba(56, 189, 248, 0.25);
        }

        h1 {
            margin: 0;
            font-size: 1.9rem;
            font-weight: 600;
        }

        .card__subtitle {
            margin: 0;
            color: #cbd5f5;
            line-height: 1.5;
        }

        form {
            display: grid;
            gap: 18px;
            margin-top: 6px;
        }

        .field {
            display: grid;
            gap: 8px;
            text-align: left;
        }

        .field label {
            font-size: 0.85rem;
            font-weight: 600;
            color: rgba(203, 213, 225, 0.88);
            letter-spacing: 0.01em;
        }

        .input {
            position: relative;
            display: flex;
            align-items: center;
        }

        .input input {
            width: 100%;
            padding: 14px 16px;
            border-radius: 14px;
            border: 1px solid rgba(148, 163, 184, 0.25);
            background: rgba(15, 23, 42, 0.86);
            color: #f8fafc;
            font-size: 1rem;
            transition: border 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
        }

        .input input:focus {
            outline: none;
            border-color: rgba(56, 189, 248, 0.65);
            box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.18);
            transform: translateY(-1px);
        }

        .input--password button {
            position: absolute;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            border: none;
            border-radius: 10px;
            padding: 6px 12px;
            background: rgba(15, 23, 42, 0.75);
            color: #93c5fd;
            font-weight: 600;
            font-size: 0.8rem;
            cursor: pointer;
            transition: background 0.2s ease, color 0.2s ease;
        }

        .input--password button:hover,
        .input--password button:focus {
            outline: none;
            background: rgba(56, 189, 248, 0.2);
            color: #f8fafc;
        }

        .submit {
            margin-top: 6px;
            padding: 14px 18px;
            border-radius: 16px;
            border: none;
            background: linear-gradient(135deg, rgba(124, 58, 237, 0.95), rgba(244, 114, 182, 0.85));
            color: #0f172a;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 18px 40px rgba(124, 58, 237, 0.32);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .submit:hover {
            transform: translateY(-2px);
            box-shadow: 0 24px 50px rgba(124, 58, 237, 0.38);
        }

        .error {
            color: #fca5a5;
            background: rgba(248, 113, 113, 0.12);
            border-radius: 14px;
            padding: 12px 14px;
            font-weight: 500;
            border: 1px solid rgba(248, 113, 113, 0.28);
            text-align: left;
        }

        .card__footer {
            margin-top: auto;
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            justify-content: center;
            font-size: 0.95rem;
        }

        .card__footer a {
            color: rgba(148, 198, 255, 0.95);
            text-decoration: none;
            font-weight: 500;
        }

        .card__footer a:hover {
            text-decoration: underline;
        }

        @media (max-width: 960px) {
            .page {
                grid-template-columns: 1fr;
                padding: clamp(24px, 5vw, 40px);
            }

            .showcase {
                order: 2;
                text-align: center;
            }

            .showcase__badge {
                margin: 0 auto;
            }

            .showcase__list li {
                justify-items: center;
                text-align: center;
            }
        }

        @media (max-width: 600px) {
            body {
                padding: 16px;
            }

            .page {
                gap: 20px;
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
    <div class="page">
        <section class="showcase" aria-label="Product highlights">
            <div class="showcase__header">
                <span class="showcase__badge">Polished for 2024</span>
                <h2 class="showcase__title">Edit faster with a workspace that keeps pace with your ideas.</h2>
                <p class="showcase__text">Video Editor Pro gives you cinematic looks, real-time previews and smart automation so you can stay focused on the story, not the settings.</p>
            </div>
            <ul class="showcase__list">
                <li>
                    <span class="showcase__icon">⚡</span>
                    <span>Instant scrubbing with buttery smooth previews across every device.</span>
                </li>
                <li>
                    <span class="showcase__icon">🎯</span>
                    <span>Intelligent scene detection highlights the best moments in your footage.</span>
                </li>
                <li>
                    <span class="showcase__icon">🤝</span>
                    <span>Shareable timelines that keep collaborators in sync in real time.</span>
                </li>
            </ul>
        </section>
        <main class="card" aria-labelledby="login-title">
            <div class="card__header">
                <div class="card__logo">🎬</div>
                <h1 id="login-title">Welcome back</h1>
                <p class="card__subtitle">Sign in to pick up where you left off and continue crafting your next video masterpiece.</p>
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
                <button class="submit" type="submit">Log in</button>
            </form>
            <div class="card__footer">
                <a href="{{ url_for('signup') }}">Create an account</a>
                <span>•</span>
                <a href="{{ url_for('home') }}">Back to home</a>
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
