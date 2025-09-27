HOME_HTML = """
<!doctype html>
<html lang="en">
<head>
    <title>Home</title>
    <style>
        body {
            font-family: 'Segoe UI', 'Roboto', Arial, sans-serif;
            background: linear-gradient(120deg, #23272f 60%, #181a20 100%);
            margin: 0; padding: 0;
            min-height: 100vh;
        }
        .topbar {
            width: 100%;
            background: #181a20;
            border-bottom: 1px solid #353a45;
            box-shadow: 0 2px 8px rgba(0,0,0,0.12);
        }
        .topbar-content {
            max-width: 900px;
            margin: 0 auto;
            display: flex;
            align-items: center;
            height: 64px;
            padding: 0 24px;
        }
        .topbar-logo {
            font-size: 32px;
            color: #ff2e63;
            margin-right: 14px;
        }
        .topbar-title {
            color: #fff;
            font-size: 22px;
            font-weight: 700;
            letter-spacing: 1px;
        }
        .main-layout {
            display: flex;
            justify-content: center;
            align-items: flex-start;
            margin: 40px auto 0 auto;
            max-width: 1400px;
            min-height: 600px;
        }
        .left-sidebar {
            width: 220px;
            background: #181a20;
            border-radius: 18px 0 0 18px;
            box-shadow: 0 2px 16px rgba(0,0,0,0.18);
            padding: 36px 24px 24px 24px;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            min-height: 480px;
            margin-right: 24px;
        }
        .left-sidebar-title {
            color: #08d9d6;
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 18px;
        }
        .upload-form {
            width: 100%;
            margin-bottom: 24px;
        }
        .upload-label {
            color: #fff;
            font-size: 15px;
            margin-bottom: 8px;
            display: block;
        }
        .upload-input {
            width: 100%;
            padding: 8px;
            border-radius: 6px;
            border: 1px solid #353a45;
            background: #23272f;
            color: #fff;
            margin-bottom: 12px;
        }
        .upload-btn {
            padding: 8px 18px;
            background: linear-gradient(90deg, #08d9d6 80%, #ff2e63 100%);
            color: #23272f;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            font-size: 15px;
            cursor: pointer;
            transition: background 0.2s, color 0.2s;
        }
        .upload-btn:hover {
            background: linear-gradient(90deg, #ff2e63 80%, #08d9d6 100%);
            color: #fff;
        }
        .sidebar {
            width: 120px;
            background: #181a20;
            border-radius: 18px 0 0 18px;
            box-shadow: 0 2px 16px rgba(0,0,0,0.18);
            padding: 36px 0 0 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 32px;
            min-height: 480px;
            /* Hide, replaced by left-sidebar */
            display: none;
        }
        .right-sidebar {
            width: 260px;
            background: #181a20;
            border-radius: 0 18px 18px 0;
            box-shadow: 0 2px 16px rgba(0,0,0,0.18);
            padding: 36px 24px 24px 24px;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            min-height: 480px;
            margin-left: 24px;
        }
        .right-sidebar-title {
            color: #ff2e63;
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 18px;
        }
        .video-detail {
            color: #fff;
            font-size: 15px;
            margin-bottom: 12px;
        }
        .video-setting-group {
            margin-bottom: 18px;
        }
        .video-setting-label {
            color: #08d9d6;
            font-size: 14px;
            margin-bottom: 4px;
            display: block;
        }
        .video-setting-input {
            width: 100%;
            padding: 6px;
            border-radius: 6px;
            border: 1px solid #353a45;
            background: #23272f;
            color: #fff;
            margin-bottom: 8px;
        }
        .workspace {
            flex: 1;
            background: #23272f;
            border-radius: 0 18px 18px 0;
            box-shadow: 0 8px 32px rgba(0,0,0,0.32);
            padding: 48px 48px 36px 48px;
            min-height: 480px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            border: 1px solid #353a45;
            position: relative;
            padding-bottom: 120px; /* space for timeline */
        }
        .logo {
            font-size: 56px;
            margin-bottom: 18px;
            color: #ff2e63;
            text-shadow: 0 2px 16px #ff2e6380;
        }
        .toolbar {
            display: flex;
            justify-content: center;
            gap: 24px;
            margin-bottom: 32px;
        }
        .toolbar-icon {
            font-size: 32px;
            color: #08d9d6;
            background: #181a20;
            border-radius: 8px;
            padding: 8px 12px;
            box-shadow: 0 2px 8px #08d9d640;
            transition: color 0.2s, background 0.2s;
            cursor: pointer;
        }
        .toolbar-icon.active, .toolbar-icon:hover {
            color: #ff2e63;
            background: #23272f;
        }
        h2 {
            color: #fff;
            margin-bottom: 28px;
            font-weight: 700;
            letter-spacing: 1px;
            font-size: 2rem;
        }
        .btn {
            display: inline-block;
            margin: 16px 10px 0 10px;
            padding: 14px 38px;
            background: linear-gradient(90deg, #08d9d6 80%, #ff2e63 100%);
            color: #23272f;
            text-decoration: none;
            border-radius: 10px;
            font-weight: 600;
            font-size: 17px;
            box-shadow: 0 2px 12px #08d9d680;
            transition: background 0.2s, box-shadow 0.2s, color 0.2s;
            border: none;
            outline: none;
        }
        .btn:hover {
            background: linear-gradient(90deg, #ff2e63 80%, #08d9d6 100%);
            color: #fff;
            box-shadow: 0 4px 24px #ff2e6380;
        }
        .footer {
            margin-top: 60px;
            padding: 24px 0 0 0;
            border-top: 1px solid #353a45;
            color: #888;
            font-size: 14px;
            letter-spacing: 0.5px;
            background: #181a20;
            border-radius: 0 0 18px 18px;
            text-align: center;
        }
        .preview-section {
            width: 80%;
            max-width: 600px;
            height: 280px;
            background: #181a20;
            border-radius: 14px;
            box-shadow: 0 2px 16px #08d9d640;
            margin: 0 auto 32px auto;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }
        .preview-placeholder {
            color: #888;
            font-size: 22px;
            letter-spacing: 1px;
        }
        .timeline-section {
            position: absolute;
            left: 0;
            bottom: 0;
            width: 100%;
            height: 100px;
            background: #181a20;
            border-top: 2px solid #353a45;
            border-radius: 0 0 18px 18px;
            box-shadow: 0 -2px 16px #23272f80;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2;
        }
        .timeline-content {
            width: 90%;
            height: 60px;
            background: #23272f;
            border-radius: 8px;
            box-shadow: 0 2px 8px #08d9d640;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #08d9d6;
            font-size: 18px;
            font-weight: 500;
            letter-spacing: 1px;
        }
    </style>
</head>
<body>
    <div class="topbar">
        <div class="topbar-content">
            <span class="topbar-logo">🎬</span>
            <span class="topbar-title">Video Editor Pro</span>
        </div>
    </div>
    <div class="main-layout">
        <div class="left-sidebar">
            <div class="left-sidebar-title">Upload File</div>
            <form class="upload-form" enctype="multipart/form-data">
                <label class="upload-label" for="video-upload">Select video file:</label>
                <input class="upload-input" type="file" id="video-upload" name="video-upload" accept="video/*">
                <button class="upload-btn" type="button">Upload</button>
            </form>
            <div style="color:#888; font-size:13px;">Supported formats: mp4, mov, avi, etc.</div>
        </div>
        <!-- .sidebar is hidden, replaced by left-sidebar -->
        <!-- <div class="sidebar"> ... </div> -->
        <div class="workspace">
            <div class="logo">🎬</div>
            <div class="toolbar">
                <span class="toolbar-icon active" title="Timeline">⏱️</span>
                <span class="toolbar-icon" title="Media">🎞️</span>
                <span class="toolbar-icon" title="Effects">✨</span>
                <span class="toolbar-icon" title="Export">📤</span>
            </div>
            <div class="preview-section">
                <span class="preview-placeholder">Preview Area (Your video will appear here)</span>
            </div>
            <h2>Welcome {{ username if username else 'Guest' }}!</h2>
            {% if username %}
                <a class="btn" href="{{ url_for('signout') }}">Sign Out</a>
            {% else %}
                <a class="btn" href="{{ url_for('login') }}">Login</a>
                <a class="btn" href="{{ url_for('signup') }}">Sign Up</a>
            {% endif %}
            <div class="timeline-section">
                <div class="timeline-content">
                    <span>Timeline Video (Drag & drop clips here)</span>
                </div>
            </div>
        </div>
        <div class="right-sidebar">
            <div class="right-sidebar-title">Video Settings &amp; Details</div>
            <div class="video-detail"><strong>File Name:</strong> <span id="video-filename">No file selected</span></div>
            <div class="video-detail"><strong>Duration:</strong> <span id="video-duration">--:--</span></div>
            <div class="video-detail"><strong>Resolution:</strong> <span id="video-resolution">---</span></div>
            <div class="video-setting-group">
                <label class="video-setting-label" for="video-volume">Volume</label>
                <input class="video-setting-input" type="range" id="video-volume" min="0" max="100" value="100">
            </div>
            <div class="video-setting-group">
                <label class="video-setting-label" for="video-speed">Playback Speed</label>
                <select class="video-setting-input" id="video-speed">
                    <option value="0.5">0.5x</option>
                    <option value="1" selected>1x</option>
                    <option value="1.5">1.5x</option>
                    <option value="2">2x</option>
                </select>
            </div>
            <div class="video-setting-group">
                <label class="video-setting-label" for="video-quality">Quality</label>
                <select class="video-setting-input" id="video-quality">
                    <option value="480p">480p</option>
                    <option value="720p" selected>720p</option>
                    <option value="1080p">1080p</option>
                </select>
            </div>
        </div>
    </div>
    <div class="footer">
        <span>Video Editor Pro &copy; 2024</span>
    </div>
</body>
</html>
"""

LOGIN_HTML = """
<!doctype html>
<html lang="en">
<head>
    <title>Login</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: linear-gradient(120deg, #f8f9fa 60%, #e3eafc 100%); margin: 0; padding: 0; }
        .container { max-width: 420px; margin: 60px auto; background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); padding: 40px 32px 32px 32px; text-align: center; }
        .logo { font-size: 48px; margin-bottom: 16px; color: #007bff; }
        h2 { color: #222; margin-bottom: 24px; font-weight: 600; }
        form { display: flex; flex-direction: column; align-items: center; }
        input[type="text"], input[type="password"] {
            padding: 12px; margin-bottom: 18px; width: 90%; border: 1px solid #d1e3ff; border-radius: 8px; font-size: 16px; background: #f4f8ff;
        }
        input[type="submit"] {
            padding: 12px 32px; background: linear-gradient(90deg, #007bff 80%, #0056b3 100%);
            color: #fff; border: none; border-radius: 8px; font-weight: 500; font-size: 16px; cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,123,255,0.08); transition: background 0.2s, box-shadow 0.2s;
        }
        input[type="submit"]:hover { background: linear-gradient(90deg, #0056b3 80%, #007bff 100%); box-shadow: 0 4px 16px rgba(0,123,255,0.12); }
        .error { color: #dc3545; margin-bottom: 16px; font-weight: 500; }
        .links { margin-top: 18px; }
        .links a { color: #007bff; text-decoration: none; margin: 0 8px; font-size: 15px; }
        .links a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🔐</div>
        <h2>Login</h2>
        {% if error %}
            <div class="error">{{ error }}</div>
        {% endif %}
        <form method="post">
            <input type="text" name="username" placeholder="Enter your username" required>
            <input type="password" name="password" placeholder="Enter your password" required>
            <input type="submit" value="Login">
        </form>
        <div class="links">
            <a href="{{ url_for('home') }}">Back to Home</a>
            <a href="{{ url_for('signup') }}">Sign Up</a>
        </div>
    </div>
</body>
</html>
"""

SIGNUP_HTML = """
<!doctype html>
<html lang="en">
<head>
    <title>Sign Up</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: linear-gradient(120deg, #f8f9fa 60%, #e3eafc 100%); margin: 0; padding: 0; }
        .container { max-width: 420px; margin: 60px auto; background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); padding: 40px 32px 32px 32px; text-align: center; }
        .logo { font-size: 48px; margin-bottom: 16px; color: #28a745; }
        h2 { color: #222; margin-bottom: 24px; font-weight: 600; }
        form { display: flex; flex-direction: column; align-items: center; }
        input[type="text"], input[type="email"], input[type="password"] {
            padding: 12px; margin-bottom: 18px; width: 90%; border: 1px solid #d1e3ff; border-radius: 8px; font-size: 16px; background: #f4f8ff;
        }
        input[type="submit"] {
            padding: 12px 32px; background: linear-gradient(90deg, #28a745 80%, #218838 100%);
            color: #fff; border: none; border-radius: 8px; font-weight: 500; font-size: 16px; cursor: pointer;
            box-shadow: 0 2px 8px rgba(40,167,69,0.08); transition: background 0.2s, box-shadow 0.2s;
        }
        input[type="submit"]:hover { background: linear-gradient(90deg, #218838 80%, #28a745 100%); box-shadow: 0 4px 16px rgba(40,167,69,0.12); }
        .error { color: #dc3545; margin-bottom: 16px; font-weight: 500; }
        .links { margin-top: 18px; }
        .links a { color: #007bff; text-decoration: none; margin: 0 8px; font-size: 15px; }
        .links a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">📝</div>
        <h2>Sign Up</h2>
        {% if error %}
            <div class="error">{{ error }}</div>
        {% endif %}
        <form method="post">
            <input type="text" name="username" placeholder="Choose a username" required>
            <input type="email" name="email" placeholder="Enter your email" required>
            <input type="password" name="password" placeholder="Create a password" required>
            <input type="submit" value="Sign Up">
        </form>
        <div class="links">
            <a href="{{ url_for('login') }}">Already have an account? Login</a>
            <a href="{{ url_for('home') }}">Back to Home</a>
        </div>
    </div>
</body>
</html>
"""
