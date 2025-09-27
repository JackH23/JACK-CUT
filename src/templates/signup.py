SIGNUP_HTML = '''
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sign Up • Video Editor Pro</title>
    <style>
        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background:
                radial-gradient(100% 100% at 0% 0%, rgba(56, 189, 248, 0.25), transparent 65%),
                radial-gradient(120% 140% at 100% 0%, rgba(244, 114, 182, 0.3), transparent 75%),
                #0f172a;
            font-family: 'Inter', 'Segoe UI', sans-serif;
            color: #f8fafc;
            padding: 20px;
        }

        .card {
            width: min(440px, 100%);
            background: rgba(15, 23, 42, 0.85);
            border-radius: 24px;
            padding: 40px 36px 32px 36px;
            box-shadow: 0 30px 80px rgba(2, 6, 23, 0.55);
            border: 1px solid rgba(148, 163, 184, 0.16);
            backdrop-filter: blur(12px);
            text-align: center;
        }

        .logo {
            width: 72px;
            height: 72px;
            border-radius: 20px;
            display: grid;
            place-items: center;
            margin: 0 auto 18px auto;
            font-size: 36px;
            background: linear-gradient(135deg, rgba(244, 114, 182, 0.95), rgba(56, 189, 248, 0.85));
            box-shadow: 0 10px 30px rgba(244, 114, 182, 0.28);
        }

        h2 {
            margin: 0 0 12px 0;
            font-size: 1.85rem;
            font-weight: 600;
        }

        p {
            margin: 0 0 24px 0;
            color: #cbd5f5;
            font-size: 0.95rem;
            line-height: 1.5;
        }

        form {
            display: grid;
            gap: 16px;
            margin-top: 12px;
        }

        input[type="text"],
        input[type="email"],
        input[type="password"] {
            width: 100%;
            padding: 14px 16px;
            border-radius: 14px;
            border: 1px solid rgba(148, 163, 184, 0.25);
            background: rgba(15, 23, 42, 0.8);
            color: #f8fafc;
            font-size: 1rem;
            transition: border 0.2s ease, box-shadow 0.2s ease;
        }

        input[type="text"]:focus,
        input[type="email"]:focus,
        input[type="password"]:focus {
            outline: none;
            border-color: rgba(244, 114, 182, 0.7);
            box-shadow: 0 0 0 3px rgba(244, 114, 182, 0.25);
        }

        input[type="submit"] {
            margin-top: 6px;
            padding: 14px 18px;
            border-radius: 14px;
            border: none;
            background: linear-gradient(135deg, rgba(244, 114, 182, 0.95), rgba(124, 58, 237, 0.85));
            color: #0f172a;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 16px 40px rgba(244, 114, 182, 0.32);
            transition: transform 0.2s ease;
        }

        input[type="submit"]:hover {
            transform: translateY(-2px);
        }

        .error {
            color: #f87171;
            background: rgba(248, 113, 113, 0.12);
            border-radius: 12px;
            padding: 12px 14px;
            font-weight: 500;
            border: 1px solid rgba(248, 113, 113, 0.35);
        }

        .links {
            margin-top: 18px;
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            justify-content: center;
            font-size: 0.95rem;
        }

        .links a {
            color: rgba(148, 198, 255, 0.95);
            text-decoration: none;
            font-weight: 500;
        }

        .links a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo">📝</div>
        <h2>Create your account</h2>
        <p>Join Video Editor Pro to organise your footage, collaborate effortlessly and share stunning edits.</p>
        {% if error %}
            <div class="error">{{ error }}</div>
        {% endif %}
        <form method="post">
            <input type="text" name="username" placeholder="Choose a username" required>
            <input type="email" name="email" placeholder="Email address" required>
            <input type="password" name="password" placeholder="Create a password" required>
            <input type="submit" value="Sign up">
        </form>
        <div class="links">
            <a href="{{ url_for('login') }}">Already have an account? Log in</a>
            <span>•</span>
            <a href="{{ url_for('home') }}">Back to home</a>
        </div>
    </div>
</body>
</html>
'''
