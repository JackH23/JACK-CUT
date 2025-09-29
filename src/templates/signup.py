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
                radial-gradient(110% 140% at 0% 10%, rgba(244, 114, 182, 0.32), transparent 65%),
                radial-gradient(130% 140% at 100% 0%, rgba(56, 189, 248, 0.28), transparent 70%),
                radial-gradient(160% 180% at 50% 130%, rgba(124, 58, 237, 0.26), transparent 75%),
                #0b1120;
            color: #f8fafc;
            padding: clamp(16px, 5vw, 48px);
        }

        .page {
            width: min(980px, 100%);
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(320px, 440px);
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
            background: linear-gradient(135deg, rgba(244, 114, 182, 0.4), rgba(56, 189, 248, 0.28));
            border: 1px solid rgba(148, 163, 184, 0.28);
            color: rgba(255, 228, 255, 0.9);
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
            color: #e2e8f0;
            font-size: 1.05rem;
        }

        .showcase__grid {
            display: grid;
            gap: 16px;
        }

        .showcase__card {
            padding: 18px 20px;
            border-radius: 18px;
            background: rgba(15, 23, 42, 0.78);
            border: 1px solid rgba(148, 163, 184, 0.2);
            display: grid;
            gap: 8px;
        }

        .showcase__card strong {
            font-size: 1.05rem;
        }

        .showcase__card span {
            color: rgba(203, 213, 225, 0.9);
            font-size: 0.95rem;
            line-height: 1.5;
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
            background: linear-gradient(135deg, rgba(244, 114, 182, 0.95), rgba(56, 189, 248, 0.85));
            box-shadow: 0 18px 40px rgba(244, 114, 182, 0.28);
        }

        h1 {
            margin: 0;
            font-size: 1.9rem;
            font-weight: 600;
        }

        .card__subtitle {
            margin: 0;
            color: #e2e8f0;
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
            color: rgba(226, 232, 240, 0.92);
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
            border-color: rgba(244, 114, 182, 0.65);
            box-shadow: 0 0 0 3px rgba(244, 114, 182, 0.22);
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
            color: rgba(244, 165, 255, 0.85);
            font-weight: 600;
            font-size: 0.8rem;
            cursor: pointer;
            transition: background 0.2s ease, color 0.2s ease;
        }

        .input--password button:hover,
        .input--password button:focus {
            outline: none;
            background: rgba(244, 114, 182, 0.24);
            color: #fdf4ff;
        }

        .helper-text {
            color: rgba(203, 213, 225, 0.8);
            font-size: 0.85rem;
        }

        .submit {
            margin-top: 6px;
            padding: 14px 18px;
            border-radius: 16px;
            border: none;
            background: linear-gradient(135deg, rgba(244, 114, 182, 0.95), rgba(124, 58, 237, 0.85));
            color: #0f172a;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 18px 40px rgba(244, 114, 182, 0.32);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .submit:hover {
            transform: translateY(-2px);
            box-shadow: 0 24px 50px rgba(244, 114, 182, 0.4);
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

            .showcase__grid {
                text-align: left;
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
        <section class="showcase" aria-label="Why creators choose us">
            <div class="showcase__header">
                <span class="showcase__badge">Start collaborating</span>
                <h2 class="showcase__title">Everything you need to storyboard, edit and publish together.</h2>
                <p class="showcase__text">Unlock collaborative timelines, AI clean up tools and export presets tuned for every platform the moment you join Video Editor Pro.</p>
            </div>
            <div class="showcase__grid">
                <div class="showcase__card">
                    <strong>Teams ready</strong>
                    <span>Invite editors, producers and clients with secure review links.</span>
                </div>
                <div class="showcase__card">
                    <strong>Smart automation</strong>
                    <span>Auto-level audio, match color palettes and set pacing in a single click.</span>
                </div>
                <div class="showcase__card">
                    <strong>Cloud workspace</strong>
                    <span>Organise assets in synced folders and jump between devices instantly.</span>
                </div>
            </div>
        </section>
        <main class="card" aria-labelledby="signup-title">
            <div class="card__header">
                <div class="card__logo">🚀</div>
                <h1 id="signup-title">Create your account</h1>
                <p class="card__subtitle">Join Video Editor Pro to organise your footage, collaborate effortlessly and share stunning edits.</p>
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
                    <p class="helper-text">Use at least 8 characters with a mix of letters and numbers for a strong password.</p>
                </div>
                <button class="submit" type="submit">Create account</button>
            </form>
            <div class="card__footer">
                <a href="{{ url_for('login') }}">Already have an account? Log in</a>
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
