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
            --surface-1: #0f172a;
            --surface-2: #111827;
            --surface-3: #1f2937;
            --surface-4: #243045;
            --accent-1: #7c3aed;
            --accent-2: #38bdf8;
            --accent-3: #f472b6;
            --text-primary: #f9fafb;
            --text-secondary: #cbd5f5;
            --border-color: rgba(148, 163, 184, 0.18);
            --shadow-soft: 0 24px 60px rgba(2, 6, 23, 0.55);
            --shadow-inner: inset 0 0 0 1px rgba(148, 163, 184, 0.12);
            font-family: 'Inter', 'Segoe UI', Roboto, Arial, sans-serif;
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            min-height: 100vh;
            background:
                radial-gradient(120% 100% at 10% 10%, rgba(124, 58, 237, 0.28), transparent 55%),
                radial-gradient(80% 100% at 90% 0%, rgba(56, 189, 248, 0.18), transparent 60%),
                radial-gradient(120% 120% at 50% 120%, rgba(244, 114, 182, 0.22), transparent 70%),
                var(--surface-1);
            color: var(--text-primary);
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 24px;
        }

        .app-shell {
            width: min(1200px, 100%);
            display: grid;
            grid-template-columns: 1fr;
            gap: 24px;
        }

        .nav-bar {
            background: rgba(17, 24, 39, 0.85);
            backdrop-filter: blur(14px);
            border-radius: 22px;
            padding: 18px 28px;
            border: 1px solid var(--border-color);
            box-shadow: var(--shadow-soft);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .nav-brand {
            display: flex;
            align-items: center;
            gap: 16px;
            font-size: 20px;
            font-weight: 600;
            letter-spacing: 0.4px;
        }

        .brand-icon {
            display: grid;
            place-items: center;
            width: 44px;
            height: 44px;
            border-radius: 12px;
            background: linear-gradient(135deg, rgba(124, 58, 237, 0.85), rgba(244, 114, 182, 0.7));
            box-shadow: 0 10px 30px rgba(124, 58, 237, 0.35);
            font-size: 26px;
        }

        .nav-actions {
            display: flex;
            gap: 12px;
            align-items: center;
        }

        .nav-actions a {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 10px 18px;
            border-radius: 12px;
            background: rgba(15, 23, 42, 0.7);
            border: 1px solid transparent;
            color: var(--text-secondary);
            text-decoration: none;
            font-weight: 500;
            transition: all 0.2s ease;
        }

        .nav-actions a.primary {
            background: linear-gradient(135deg, rgba(124, 58, 237, 0.95), rgba(56, 189, 248, 0.9));
            color: #0f172a;
            font-weight: 600;
            border: none;
            box-shadow: 0 10px 30px rgba(56, 189, 248, 0.28);
        }

        .nav-actions a:hover {
            border-color: rgba(148, 163, 184, 0.32);
            transform: translateY(-1px);
        }

        .hero {
            position: relative;
            border-radius: 28px;
            padding: clamp(32px, 8vw, 60px);
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid var(--border-color);
            box-shadow: var(--shadow-soft);
            overflow: hidden;
        }

        .hero::after {
            content: "";
            position: absolute;
            inset: 0;
            background: radial-gradient(circle at 80% 20%, rgba(56, 189, 248, 0.2), transparent 60%);
            pointer-events: none;
        }

        .hero-content {
            position: relative;
            display: grid;
            gap: 24px;
        }

        .hero h1 {
            font-size: clamp(2.2rem, 5vw, 3.4rem);
            margin: 0;
            font-weight: 700;
            letter-spacing: -0.02em;
        }

        .hero p {
            margin: 0;
            font-size: clamp(1rem, 2.4vw, 1.2rem);
            color: var(--text-secondary);
            line-height: 1.6;
        }

        .hero-cta {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            margin-top: 8px;
        }

        .hero-cta a {
            padding: 14px 28px;
            border-radius: 14px;
            text-decoration: none;
            font-weight: 600;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .hero-cta a.primary {
            background: linear-gradient(135deg, rgba(124, 58, 237, 1), rgba(244, 114, 182, 0.95));
            color: #0b1020;
            box-shadow: 0 20px 40px rgba(124, 58, 237, 0.35);
        }

        .hero-cta a.secondary {
            background: rgba(15, 23, 42, 0.72);
            border: 1px solid rgba(148, 163, 184, 0.28);
            color: var(--text-secondary);
        }

        .hero-cta a:hover {
            transform: translateY(-2px);
        }

        .editor-layout {
            display: grid;
            grid-template-columns: minmax(220px, 260px) minmax(0, 1fr) minmax(220px, 260px);
            gap: 24px;
            grid-template-areas: "upload preview settings";
            align-items: start;
        }

        .upload-card {
            grid-area: upload;
        }

        .preview-card {
            grid-area: preview;
        }

        .preview-toolbar {
            margin-top: 12px;
            display: flex;
            justify-content: flex-end;
            align-items: center;
            gap: 12px;
        }

        .preview-toolbar label {
            font-size: 0.85rem;
            color: var(--text-secondary);
            white-space: nowrap;
        }

        .preview-toolbar select {
            padding: 8px 12px;
            border-radius: 10px;
            border: 1px solid rgba(148, 163, 184, 0.28);
            background: rgba(15, 23, 42, 0.9);
            color: var(--text-primary);
            font-size: 0.9rem;
            width: auto;
            min-width: 120px;
        }

        .settings-card {
            grid-area: settings;
        }

        .timeline-footer {
            margin-top: 12px;
        }

        .panel {
            background: rgba(17, 24, 39, 0.82);
            border-radius: 22px;
            border: 1px solid var(--border-color);
            box-shadow: var(--shadow-soft);
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 18px;
        }

        .panel h2 {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 600;
        }

        .upload-card label,
        .settings-card label {
            font-size: 0.9rem;
            color: var(--text-secondary);
            margin-bottom: 6px;
            display: block;
        }

        .upload-card input[type="file"],
        .settings-card input,
        .settings-card select,
        .preview-toolbar select {
            width: 100%;
            padding: 12px 14px;
            border-radius: 12px;
            border: 1px solid rgba(148, 163, 184, 0.28);
            background: rgba(15, 23, 42, 0.9);
            color: var(--text-primary);
            font-size: 0.95rem;
            transition: border 0.2s ease, box-shadow 0.2s ease;
        }

        .upload-card input[type="file"]:focus,
        .settings-card input:focus,
        .settings-card select:focus,
        .preview-toolbar select:focus {
            outline: none;
            border-color: rgba(56, 189, 248, 0.6);
            box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
        }

        .upload-card button {
            padding: 12px 20px;
            border-radius: 12px;
            border: none;
            background: linear-gradient(135deg, rgba(56, 189, 248, 0.95), rgba(124, 58, 237, 0.85));
            color: #081229;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 16px 30px rgba(56, 189, 248, 0.25);
            transition: transform 0.2s ease;
        }

        .upload-card button:hover {
            transform: translateY(-2px);
        }

        .export-button {
            margin-top: 8px;
            padding: 12px 20px;
            border-radius: 12px;
            border: none;
            background: linear-gradient(135deg, rgba(124, 58, 237, 0.95), rgba(244, 114, 182, 0.9));
            color: #0b1020;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 16px 30px rgba(124, 58, 237, 0.25);
            transition: transform 0.2s ease;
        }

        .export-button:hover {
            transform: translateY(-2px);
        }

        .preview-area {
            --preview-aspect-ratio: 16 / 9;
            position: relative;
            border-radius: 20px;
            background: linear-gradient(145deg, rgba(15, 23, 42, 0.8), rgba(36, 48, 69, 0.9));
            border: 1px solid rgba(148, 163, 184, 0.18);
            box-shadow: var(--shadow-inner);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-secondary);
            font-size: 1.1rem;
            padding: 16px;
            min-height: 260px;
            overflow: hidden;
        }

        .preview-area.has-image {
            align-items: center;
            justify-content: center;
        }

        .preview-viewport {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            max-width: 100%;
            max-height: 100%;
            aspect-ratio: var(--preview-aspect-ratio);
            border-radius: 16px;
            background: rgba(8, 13, 28, 0.92);
            box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.45);
            overflow: hidden;
            transition: aspect-ratio 0.2s ease;
        }

        #preview-placeholder {
            text-align: center;
            line-height: 1.6;
            padding: 0 12px;
        }

        .preview-viewport video {
            width: 100%;
            height: 100%;
            object-fit: contain;
            border-radius: 16px;
        }

        .preview-viewport img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            border-radius: 16px;
            display: block;
        }

        .timeline-card {
            position: relative;
            overflow: hidden;
        }

        .timeline-track {
            position: relative;
            display: flex;
            flex-wrap: nowrap;
            align-items: stretch;
            gap: 10px;
            padding: 16px;
            border-radius: 14px;
            background: rgba(8, 12, 24, 0.75);
            border: 1px dashed rgba(148, 163, 184, 0.24);
            color: var(--text-secondary);
            text-align: center;
            font-size: 0.95rem;
            min-height: 140px;
            overflow-x: auto;
            overflow-y: hidden;
            scrollbar-width: thin;
            scroll-snap-type: x proximity;
        }

        .timeline-track::-webkit-scrollbar {
            height: 8px;
        }

        .timeline-track::-webkit-scrollbar-thumb {
            background: rgba(124, 58, 237, 0.4);
            border-radius: 999px;
        }

        .timeline-track::-webkit-scrollbar-track {
            background: rgba(15, 23, 42, 0.6);
        }

        .export-modal {
            position: fixed;
            inset: 0;
            background: rgba(9, 13, 26, 0.65);
            backdrop-filter: blur(10px);
            display: none;
            align-items: center;
            justify-content: center;
            padding: 24px;
            z-index: 1000;
        }

        .export-modal[aria-hidden="false"] {
            display: flex;
        }

        .export-modal__dialog {
            width: min(520px, 100%);
            background: rgba(17, 24, 39, 0.92);
            border-radius: 22px;
            border: 1px solid rgba(148, 163, 184, 0.28);
            box-shadow: 0 30px 60px rgba(2, 6, 23, 0.55);
            padding: 28px;
            display: flex;
            flex-direction: column;
            gap: 18px;
        }

        .export-modal__header {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .export-modal__header h3 {
            margin: 0;
            font-size: 1.35rem;
            font-weight: 600;
        }

        .export-modal__summary {
            margin: 0;
            color: var(--text-secondary);
            font-size: 0.95rem;
            line-height: 1.5;
        }

        .export-modal__list {
            margin: 0;
            padding: 0;
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-height: 220px;
            overflow-y: auto;
        }

        .export-modal__list-item {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 12px 14px;
            border-radius: 14px;
            background: rgba(30, 41, 59, 0.7);
            border: 1px solid rgba(148, 163, 184, 0.24);
        }

        .export-modal__list-item strong {
            font-size: 0.95rem;
        }

        .export-modal__meta {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            font-size: 0.8rem;
            color: var(--text-secondary);
        }

        .export-modal__actions {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
        }

        .export-modal__actions button {
            padding: 12px 20px;
            border-radius: 12px;
            border: none;
            font-weight: 600;
            cursor: pointer;
        }

        #export-cancel-button {
            background: rgba(15, 23, 42, 0.75);
            color: var(--text-secondary);
            border: 1px solid rgba(148, 163, 184, 0.24);
        }

        #export-confirm-button {
            background: linear-gradient(135deg, rgba(124, 58, 237, 0.95), rgba(56, 189, 248, 0.92));
            color: #0b1020;
            box-shadow: 0 16px 30px rgba(124, 58, 237, 0.25);
        }

        #export-status-message {
            min-height: 20px;
            font-size: 0.85rem;
            color: var(--text-secondary);
        }

        #export-status-message[data-state="success"] {
            color: #34d399;
        }

        #export-status-message[data-state="error"] {
            color: #f87171;
        }

        .timeline-item {
            position: relative;
            padding: 8px;
            border-radius: 12px;
            background: rgba(30, 41, 59, 0.7);
            border: 1px solid rgba(148, 163, 184, 0.2);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            overflow: hidden;
            flex: 0 0 auto;
            min-width: 96px;
            width: 120px;
            cursor: grab;
            user-select: none;
            transition: border 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
            scroll-snap-align: start;
        }

        .timeline-item[data-resize-cursor="left"],
        .timeline-item[data-resize-cursor="right"] {
            cursor: ew-resize;
        }

        .timeline-item:active {
            cursor: grabbing;
        }

        .timeline-item.dragging {
            opacity: 0.6;
            transform: scale(0.98);
        }

        .timeline-item.is-resizing {
            cursor: ew-resize;
        }

        .timeline-item.active {
            border-color: rgba(124, 58, 237, 0.6);
            box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.25);
        }

        .timeline-item img,
        .timeline-item video,
        .timeline-thumbnail {
            width: 100%;
            height: 40px;
            border-radius: 8px;
            object-fit: cover;
        }

        .timeline-item span {
            font-size: 0.8rem;
            line-height: 1.3;
            word-break: break-word;
            pointer-events: none;
        }

        .timeline-item video {
            background: #000;
        }

        .timeline-item-duration {
            position: absolute;
            top: 6px;
            left: 6px;
            padding: 2px 8px;
            border-radius: 8px;
            background: rgba(15, 23, 42, 0.78);
            border: 1px solid rgba(148, 163, 184, 0.28);
            color: var(--text-secondary);
            font-size: 0.75rem;
            font-variant-numeric: tabular-nums;
            line-height: 1;
            pointer-events: none;
            backdrop-filter: blur(4px);
        }

        .timeline-resize-handle {
            position: absolute;
            top: 8px;
            bottom: 8px;
            width: 12px;
            border-radius: 999px;
            background: rgba(148, 163, 184, 0.35);
            border: 1px solid rgba(148, 163, 184, 0.5);
            box-shadow: 0 2px 8px rgba(15, 23, 42, 0.4);
            cursor: ew-resize;
            backdrop-filter: blur(4px);
            pointer-events: auto;
            opacity: 0;
            transition: opacity 0.2s ease, background 0.2s ease;
        }

        .timeline-item:hover .timeline-resize-handle,
        .timeline-item.is-resizing .timeline-resize-handle {
            opacity: 1;
        }

        .timeline-resize-handle::before {
            content: '';
            display: block;
            width: 2px;
            height: 50%;
            border-radius: 999px;
            background: rgba(15, 23, 42, 0.75);
            margin: auto;
        }

        .timeline-resize-handle.left {
            left: 4px;
            cursor: w-resize;
        }

        .timeline-resize-handle.right {
            right: 4px;
            cursor: e-resize;
        }

        #timeline-empty-state {
            margin: auto;
            pointer-events: none;
        }

        .playback-time {
            font-variant-numeric: tabular-nums;
            font-size: 0.9rem;
            color: var(--text-secondary);
            padding: 6px 10px;
            border-radius: 10px;
            background: rgba(15, 23, 42, 0.7);
            border: 1px solid rgba(148, 163, 184, 0.2);
        }

        .timeline-progress {
            margin-top: 12px;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            border-radius: 14px;
            background: rgba(8, 12, 24, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.18);
        }

        .timeline-progress label {
            font-size: 0.9rem;
            color: var(--text-secondary);
            white-space: nowrap;
        }

        .timeline-progress input[type="range"] {
            flex: 1;
            accent-color: rgba(124, 58, 237, 0.9);
            min-width: 140px;
        }

        .timeline-progress button {
            padding: 10px 16px;
            border-radius: 10px;
            border: none;
            background: linear-gradient(135deg, rgba(124, 58, 237, 0.95), rgba(56, 189, 248, 0.9));
            color: #0b1020;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 12px 26px rgba(124, 58, 237, 0.25);
            transition: transform 0.2s ease;
        }

        .timeline-progress-line {
            position: absolute;
            top: 6px;
            left: var(--timeline-progress-offset, 16px);
            height: 3px;
            width: var(--timeline-progress-span, calc(100% - 32px));
            background: linear-gradient(90deg, rgba(56, 189, 248, 0.9), rgba(124, 58, 237, 0.9));
            border-radius: 999px;
            transform-origin: left center;
            transform: scaleX(0);
            pointer-events: none;
            transition: transform 0.2s linear;
            opacity: 0.85;
        }

        .timeline-progress button:hover {
            transform: translateY(-2px);
        }

        .info-list {
            display: grid;
            gap: 16px;
        }

        .info-item {
            display: flex;
            gap: 14px;
            align-items: flex-start;
            font-size: 0.95rem;
            color: var(--text-secondary);
        }

        .info-icon {
            display: grid;
            place-items: center;
            width: 36px;
            height: 36px;
            border-radius: 12px;
            background: rgba(124, 58, 237, 0.18);
            color: rgba(124, 58, 237, 0.95);
            font-size: 18px;
        }

        .footer {
            margin-top: 16px;
            text-align: center;
            color: var(--text-secondary);
            font-size: 0.9rem;
        }

        @media (max-width: 960px) {
            .editor-layout {
                grid-template-columns: repeat(2, minmax(220px, 1fr));
                grid-template-areas:
                    "upload preview"
                    "settings preview";
            }
        }

        @media (max-width: 600px) {
            body {
                padding: 16px;
            }
            .nav-bar {
                flex-direction: column;
                align-items: flex-start;
                gap: 16px;
            }
            .hero {
                padding: 28px;
            }
            .hero-cta {
                flex-direction: column;
                align-items: stretch;
            }
            .nav-actions {
                width: 100%;
                justify-content: flex-start;
            }
            .nav-actions a {
                flex: 1;
                text-align: center;
            }
            .editor-layout {
                grid-template-columns: 1fr;
                grid-template-areas:
                    "preview"
                    "upload"
                    "settings";
            }
        }
    </style>
</head>
<body>
    <div class="app-shell">
        <header class="nav-bar">
            <div class="nav-brand">
                <span class="brand-icon">🎬</span>
                <span>Video Editor Pro</span>
            </div>
            <nav class="nav-actions">
                {% if username %}
                    <span style="color: var(--text-secondary); font-size: 0.95rem;">Hi, {{ username }} 👋</span>
                    <a class="primary" href="{{ url_for('signout') }}">Sign Out</a>
                {% else %}
                    <a href="{{ url_for('login') }}">Log In</a>
                    <a class="primary" href="{{ url_for('signup') }}">Get Started</a>
                {% endif %}
            </nav>
        </header>

        <section id="features" class="editor-layout">
            <article class="panel upload-card">
                <h2>Upload footage</h2>
                <p class="info-text">Drag in your raw clips or browse your drive to start building the story.</p>
                <label for="video-upload">Select a video file</label>
                <input type="file" id="video-upload" name="video-upload" accept="video/*,image/*" multiple>
                <button type="button" id="upload-button">Upload file</button>
                <small style="color: var(--text-secondary);">Supported formats: MP4, MOV, AVI and more.</small>
            </article>

            <article class="panel preview-card">
                <h2>Preview window</h2>
                <div class="preview-area">
                    <div class="preview-viewport">
                        <span id="preview-placeholder">Drop clips here to preview your edit</span>
                        <video id="preview-video" controls hidden></video>
                        <img id="preview-image" alt="Preview" hidden>
                    </div>
                </div>
                <div class="preview-toolbar">
                    <label for="preview-aspect">Aspect ratio</label>
                    <select id="preview-aspect">
                        <option value="16:9" selected>16:9 (Landscape)</option>
                        <option value="9:16">9:16 (Portrait)</option>
                    </select>
                </div>
            </article>

            <article class="panel settings-card">
                <h2>Playback settings</h2>
                <div class="info-list">
                    <div class="info-item">
                        <div class="info-icon">🎚️</div>
                        <div>
                            <label for="video-volume">Volume</label>
                            <input type="range" id="video-volume" min="0" max="100" value="80">
                        </div>
                    </div>
                    <div class="info-item">
                        <div class="info-icon">⏱️</div>
                        <div>
                            <label for="video-speed">Playback speed</label>
                            <select id="video-speed">
                                <option value="0.5">0.5x</option>
                                <option value="1" selected>1x (default)</option>
                                <option value="1.5">1.5x</option>
                                <option value="2">2x</option>
                            </select>
                        </div>
                    </div>
                    <div class="info-item">
                        <div class="info-icon">🖥️</div>
                        <div>
                            <label for="video-quality">Quality</label>
                            <select id="video-quality">
                                <option value="480p">480p</option>
                                <option value="720p" selected>720p HD</option>
                                <option value="1080p">1080p Full HD</option>
                            </select>
                        </div>
                    </div>
                </div>
                <button type="button" class="export-button">Export video</button>
            </article>
        </section>

        <section class="panel timeline-card timeline-footer">
            <h2>Timeline overview</h2>
            <div class="timeline-track" id="timeline-track">
                <div class="timeline-progress-line" id="timeline-progress-line" aria-hidden="true"></div>
                <span id="timeline-empty-state">Upload media to build your timeline</span>
            </div>
            <div class="timeline-progress">
                <label for="timeline-progress">Progress</label>
                <input type="range" id="timeline-progress" min="0" max="100" value="0">
                <span class="playback-time" id="playback-time" aria-live="polite">00:00 / 00:00</span>
                <button type="button" id="play-video-button">Play Back</button>
            </div>
        </section>

        <div class="export-modal" id="export-modal" role="dialog" aria-modal="true" aria-hidden="true">
            <div class="export-modal__dialog" role="document">
                <div class="export-modal__header">
                    <h3>Export to MP4</h3>
                    <p class="export-modal__summary" id="export-summary">Review the clips that will be exported from your preview window.</p>
                </div>
                <ul class="export-modal__list" id="export-content-list" aria-live="polite"></ul>
                <div id="export-status-message" role="status"></div>
                <div class="export-modal__actions">
                    <button type="button" id="export-cancel-button">Cancel</button>
                    <button type="button" id="export-confirm-button">Confirm export</button>
                </div>
            </div>
        </div>

        <footer class="footer">
            © {{ 2024 }} Video Editor Pro. Crafted for creators.
        </footer>
    </div>
    <script>
        const uploadInput = document.getElementById('video-upload');
        const uploadButton = document.getElementById('upload-button');
        const previewArea = document.querySelector('.preview-area');
        const previewViewport = document.querySelector('.preview-viewport');
        const previewVideo = document.getElementById('preview-video');
        const previewImage = document.getElementById('preview-image');
        const previewPlaceholder = document.getElementById('preview-placeholder');
        const timelineTrack = document.getElementById('timeline-track');
        const timelineEmptyState = document.getElementById('timeline-empty-state');
        const playVideoButton = document.getElementById('play-video-button');
        const timelineProgressLine = document.getElementById('timeline-progress-line');
        const timelineProgressInput = document.getElementById('timeline-progress');
        const previewAspectSelect = document.getElementById('preview-aspect');
        const playbackTimeDisplay = document.getElementById('playback-time');
        const exportButton = document.querySelector('.export-button');
        const exportModal = document.getElementById('export-modal');
        const exportContentList = document.getElementById('export-content-list');
        const exportSummary = document.getElementById('export-summary');
        const exportStatusMessage = document.getElementById('export-status-message');
        const exportConfirmButton = document.getElementById('export-confirm-button');
        const exportCancelButton = document.getElementById('export-cancel-button');
        let activeTimelineItem = null;
        let isTimelinePlaying = false;
        let timelinePlaybackAbort = null;
        let currentPreviewAspectRatio = 16 / 9;
        let previewViewportResizeFrame = null;
        let timelineIndicatorResizeFrame = null;
        let previewAreaResizeObserver = null;
        let timelineTrackResizeObserver = null;

        const IMAGE_FRAME_DURATION = 1000;
        const DEFAULT_VIDEO_DURATION = 3000;
        const MIN_IMAGE_DURATION = 400;
        const TIMELINE_DURATION_PER_PIXEL = 12;
        const MIN_TIMELINE_ITEM_WIDTH = 96;

        let playbackClockAnimationFrame = null;
        let playbackClockStartTimestamp = 0;
        let playbackClockBaseElapsed = 0;
        let playbackClockTotalDuration = 0;
        let playbackDisplayCurrentMs = 0;
        let playbackDisplayTotalMs = 0;

        function formatTime(milliseconds) {
            const safeMs = Math.max(0, Math.floor(Number(milliseconds) || 0));
            const totalSeconds = Math.floor(safeMs / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        function updatePlaybackTimeDisplay(currentMs, totalMs) {
            playbackDisplayCurrentMs = Math.max(0, Math.floor(Number(currentMs) || 0));
            playbackDisplayTotalMs = Math.max(0, Math.floor(Number(totalMs) || 0));

            if (!playbackTimeDisplay) {
                return;
            }

            const clampedCurrent = Math.min(playbackDisplayCurrentMs, playbackDisplayTotalMs);
            playbackTimeDisplay.textContent = `${formatTime(clampedCurrent)} / ${formatTime(playbackDisplayTotalMs)}`;
            playbackTimeDisplay.dataset.current = String(clampedCurrent);
            playbackTimeDisplay.dataset.total = String(playbackDisplayTotalMs);
        }

        function startPlaybackClock(startElapsed, totalDuration) {
            playbackClockBaseElapsed = Math.max(0, Number(startElapsed) || 0);
            playbackClockTotalDuration = Math.max(0, Number(totalDuration) || 0);
            playbackClockStartTimestamp = performance.now();

            if (playbackClockAnimationFrame) {
                window.cancelAnimationFrame(playbackClockAnimationFrame);
            }

            const tick = () => {
                if (!isTimelinePlaying) {
                    return;
                }
                const now = performance.now();
                const elapsed = Math.min(
                    playbackClockTotalDuration,
                    playbackClockBaseElapsed + Math.max(0, now - playbackClockStartTimestamp),
                );
                updatePlaybackTimeDisplay(elapsed, playbackClockTotalDuration);
                playbackClockAnimationFrame = window.requestAnimationFrame(tick);
            };

            tick();
        }

        function stopPlaybackClock(resetDisplay = true) {
            if (playbackClockAnimationFrame) {
                window.cancelAnimationFrame(playbackClockAnimationFrame);
                playbackClockAnimationFrame = null;
            }

            if (resetDisplay) {
                updateActiveTimelineIndicators();
            }
        }

        function durationToWidth(durationMs) {
            if (!Number.isFinite(durationMs) || durationMs <= 0) {
                return MIN_TIMELINE_ITEM_WIDTH;
            }
            return Math.max(MIN_TIMELINE_ITEM_WIDTH, Math.round(durationMs / TIMELINE_DURATION_PER_PIXEL));
        }

        function widthToDuration(widthPx) {
            if (!Number.isFinite(widthPx) || widthPx <= 0) {
                return MIN_IMAGE_DURATION;
            }
            return Math.max(MIN_IMAGE_DURATION, Math.round(widthPx * TIMELINE_DURATION_PER_PIXEL));
        }

        function applyTimelineItemDurationStyles(timelineItem, durationMs) {
            const width = durationToWidth(durationMs);
            timelineItem.style.width = `${width}px`;
            timelineItem.style.flexBasis = `${width}px`;
        }

        function ensureTimelineItemDurationBadge(timelineItem) {
            if (!timelineItem) {
                return null;
            }
            let badge = timelineItem.querySelector('.timeline-item-duration');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'timeline-item-duration';
                badge.setAttribute('aria-hidden', 'true');
                timelineItem.appendChild(badge);
            }
            return badge;
        }

        function formatDurationBadgeLabel(durationMs) {
            const safeMs = Math.max(0, Math.round(Number(durationMs) || 0));
            if (safeMs >= 3600000) {
                let hours = Math.floor(safeMs / 3600000);
                let minutes = Math.round((safeMs % 3600000) / 60000);
                if (minutes === 60) {
                    hours += 1;
                    minutes = 0;
                }
                return `${hours}h ${String(minutes).padStart(2, '0')}m`;
            }
            if (safeMs >= 60000) {
                const minutes = Math.floor(safeMs / 60000);
                let seconds = Math.round((safeMs % 60000) / 1000);
                if (seconds === 60) {
                    return `${minutes + 1}m 00s`;
                }
                return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
            }
            if (safeMs >= 1000) {
                const seconds = safeMs / 1000;
                const decimals = seconds >= 10 ? 0 : 1;
                return `${seconds.toFixed(decimals)}s`;
            }
            return `${safeMs}ms`;
        }

        function updateTimelineItemDurationBadge(timelineItem, durationMs) {
            const badge = ensureTimelineItemDurationBadge(timelineItem);
            if (!badge) {
                return;
            }
            const safeMs = Math.max(0, Math.round(Number(durationMs) || 0));
            badge.dataset.duration = String(safeMs);
            badge.textContent = formatDurationBadgeLabel(safeMs);
        }

        function setTimelineItemDuration(timelineItem, durationKey, durationMs, options = {}) {
            if (!timelineItem || !durationKey) {
                return 0;
            }

            const minimum = getTimelineItemMinimumDuration(timelineItem);
            const desired = Math.round(Number(durationMs) || 0);
            const applied = Math.max(minimum, desired);

            timelineItem.dataset[durationKey] = String(applied);

            if (Object.prototype.hasOwnProperty.call(options, 'markCustom')) {
                if (options.markCustom) {
                    timelineItem.dataset.customDuration = '1';
                } else {
                    delete timelineItem.dataset.customDuration;
                }
            }

            applyTimelineItemDurationStyles(timelineItem, applied);
            updateTimelineItemDurationBadge(timelineItem, applied);
            return applied;
        }

        function getTimelineItems() {
            return Array.from(timelineTrack.querySelectorAll('.timeline-item'));
        }

        function getTotalTimelineDuration() {
            return getTimelineItems().reduce(
                (total, item) => total + getTimelineItemPlaybackDuration(item),
                0,
            );
        }

        function getTimelineItemStartTime(timelineItem) {
            const items = getTimelineItems();
            let elapsed = 0;
            for (const item of items) {
                if (item === timelineItem) {
                    return elapsed;
                }
                elapsed += getTimelineItemPlaybackDuration(item);
            }
            return 0;
        }

        function describeTimelineItemForExport(timelineItem, index) {
            if (!timelineItem) {
                return null;
            }
            const fileType = timelineItem.dataset.fileType || 'unknown';
            const label = timelineItem.querySelector('span');
            const name = label ? label.textContent || `Clip ${index + 1}` : `Clip ${index + 1}`;
            const durationMs = getTimelineItemPlaybackDuration(timelineItem);
            return {
                index: index + 1,
                name: name.trim() || `Clip ${index + 1}`,
                type: fileType,
                durationMs,
                durationLabel: formatDurationBadgeLabel(durationMs),
            };
        }

        function collectTimelineSummary() {
            const items = getTimelineItems();
            const described = items
                .map((item, index) => describeTimelineItemForExport(item, index))
                .filter(Boolean);
            const totalDuration = described.reduce((total, item) => total + item.durationMs, 0);
            return {
                totalDuration,
                totalDurationLabel: formatDurationBadgeLabel(totalDuration),
                items: described,
            };
        }

        function updateExportStatus(message = '', state = '') {
            if (!exportStatusMessage) {
                return;
            }
            exportStatusMessage.textContent = message;
            if (state) {
                exportStatusMessage.dataset.state = state;
            } else {
                exportStatusMessage.removeAttribute('data-state');
            }
        }

        function renderExportDetails(summary) {
            if (!exportContentList || !summary) {
                return;
            }
            exportContentList.innerHTML = '';
            summary.items.forEach((item) => {
                const listItem = document.createElement('li');
                listItem.className = 'export-modal__list-item';

                const title = document.createElement('strong');
                title.textContent = `${item.index}. ${item.name}`;
                listItem.appendChild(title);

                const meta = document.createElement('div');
                meta.className = 'export-modal__meta';
                const type = document.createElement('span');
                type.textContent = item.type.startsWith('video/')
                    ? 'Video clip'
                    : item.type.startsWith('image/')
                        ? 'Image frame'
                        : item.type;
                const duration = document.createElement('span');
                duration.textContent = `Duration: ${item.durationLabel}`;
                meta.append(type, duration);
                listItem.appendChild(meta);

                exportContentList.appendChild(listItem);
            });

            if (exportSummary) {
                const clipLabel = summary.items.length === 1 ? 'clip' : 'clips';
                exportSummary.textContent = `Ready to export ${summary.items.length} ${clipLabel} with a combined length of ${summary.totalDurationLabel}.`;
            }

            updateExportStatus('', '');
        }

        function openExportModal(summary) {
            if (!exportModal) {
                return;
            }
            renderExportDetails(summary);
            exportModal.setAttribute('aria-hidden', 'false');
            exportModal.focus?.();
        }

        function closeExportModal() {
            if (!exportModal) {
                return;
            }
            exportModal.setAttribute('aria-hidden', 'true');
            updateExportStatus('', '');
        }

        function ensurePreviewHasActiveItem() {
            const timelineItems = getTimelineItems();
            if (!timelineItems.length) {
                return null;
            }
            let target = activeTimelineItem;
            if (!target || !timelineItems.includes(target)) {
                target = timelineItems[0];
            }
            if (target) {
                setActiveTimelineItem(target);
                loadPreviewFromTimeline(target);
            }
            return target;
        }

        function getPreviewCapture() {
            const attemptNativeCapture = (element) => {
                if (!element) {
                    return null;
                }
                if (typeof element.captureStream === 'function') {
                    return element.captureStream();
                }
                if (typeof element.mozCaptureStream === 'function') {
                    return element.mozCaptureStream();
                }
                return null;
            };

            const viewportStream = attemptNativeCapture(previewViewport);
            if (viewportStream) {
                return { stream: viewportStream, stop: () => {} };
            }

            if (!previewVideo.hidden) {
                const videoStream = attemptNativeCapture(previewVideo);
                if (videoStream) {
                    return { stream: videoStream, stop: () => {} };
                }
            }

            if (!previewViewport || typeof HTMLCanvasElement === 'undefined') {
                return null;
            }

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');

            if (!context || typeof canvas.captureStream !== 'function') {
                return null;
            }

            const fallbackFrameRate = 30;
            let animationFrameId = null;
            let stopped = false;

            const drawContainedElement = (element, sourceWidth, sourceHeight, viewportWidth, viewportHeight) => {
                if (!element || !sourceWidth || !sourceHeight || !viewportWidth || !viewportHeight) {
                    return false;
                }
                const scale = Math.min(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
                const targetWidth = sourceWidth * scale;
                const targetHeight = sourceHeight * scale;
                const offsetX = (viewportWidth - targetWidth) / 2;
                const offsetY = (viewportHeight - targetHeight) / 2;
                context.drawImage(element, offsetX, offsetY, targetWidth, targetHeight);
                return true;
            };

            const renderFrame = () => {
                if (stopped) {
                    return;
                }

                const rect = previewViewport.getBoundingClientRect();
                const deviceScale = window.devicePixelRatio || 1;
                const width = Math.max(1, Math.round(rect.width * deviceScale));
                const height = Math.max(1, Math.round(rect.height * deviceScale));

                if (canvas.width !== width || canvas.height !== height) {
                    canvas.width = width;
                    canvas.height = height;
                }

                context.setTransform(1, 0, 0, 1, 0, 0);
                context.clearRect(0, 0, canvas.width, canvas.height);
                context.scale(deviceScale, deviceScale);

                const computedStyle = window.getComputedStyle(previewViewport);
                const backgroundColor = computedStyle?.backgroundColor || '#000';
                context.fillStyle = backgroundColor;
                context.fillRect(0, 0, rect.width, rect.height);

                const videoVisible = !previewVideo.hidden && previewVideo.readyState >= 1;
                const imageVisible = !previewImage.hidden && previewImage.naturalWidth > 0;

                let drewContent = false;

                if (videoVisible) {
                    drewContent = drawContainedElement(
                        previewVideo,
                        previewVideo.videoWidth,
                        previewVideo.videoHeight,
                        rect.width,
                        rect.height,
                    );
                }

                if (!drewContent && imageVisible) {
                    drewContent = drawContainedElement(
                        previewImage,
                        previewImage.naturalWidth,
                        previewImage.naturalHeight,
                        rect.width,
                        rect.height,
                    );
                }

                if (!drewContent) {
                    const placeholder = previewPlaceholder?.textContent?.trim() || 'Preview unavailable';
                    context.fillStyle = '#94a3b8';
                    context.textAlign = 'center';
                    context.textBaseline = 'middle';
                    const fontSize = Math.min(24, Math.max(14, rect.width / 18));
                    context.font = `${fontSize}px "Inter", "Segoe UI", sans-serif`;
                    const lines = placeholder.split(/\n+/).map((line) => line.trim()).filter(Boolean);
                    if (!lines.length) {
                        lines.push('Preview unavailable');
                    }
                    const lineHeight = fontSize * 1.4;
                    const startY = rect.height / 2 - ((lines.length - 1) * lineHeight) / 2;
                    lines.forEach((line, index) => {
                        context.fillText(line, rect.width / 2, startY + index * lineHeight);
                    });
                }

                context.setTransform(1, 0, 0, 1, 0, 0);
                animationFrameId = window.requestAnimationFrame(renderFrame);
            };

            renderFrame();

            const stream = canvas.captureStream(fallbackFrameRate);

            const stop = () => {
                if (stopped) {
                    return;
                }
                stopped = true;
                if (animationFrameId) {
                    window.cancelAnimationFrame(animationFrameId);
                }
                stream.getTracks().forEach((track) => track.stop());
            };

            return { stream, stop };
        }

        async function recordTimelinePlaybackToBlob() {
            const capture = getPreviewCapture();
            if (!capture || !capture.stream) {
                throw new Error('Preview capture is not supported in this browser.');
            }

            const { stream, stop: stopCapture } = capture;

            if (typeof MediaRecorder === 'undefined') {
                throw new Error('Video exporting is not supported in this browser.');
            }

            const mimeCandidates = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
            const supportedMime = mimeCandidates.find((candidate) => {
                try {
                    return MediaRecorder.isTypeSupported(candidate);
                } catch (error) {
                    return false;
                }
            }) || '';

            const options = supportedMime ? { mimeType: supportedMime } : undefined;
            const recorder = new MediaRecorder(stream, options);
            const chunks = [];

            const stopped = new Promise((resolve, reject) => {
                recorder.addEventListener('dataavailable', (event) => {
                    if (event.data && event.data.size) {
                        chunks.push(event.data);
                    }
                });
                recorder.addEventListener('stop', () => {
                    const type = supportedMime || (chunks[0] ? chunks[0].type : 'video/mp4');
                    resolve(new Blob(chunks, { type }));
                });
                recorder.addEventListener('error', (event) => {
                    reject(event.error || new Error('Failed to export recording.'));
                });
            });

            recorder.start();

            try {
                await playTimelineSequence(0);
            } finally {
                if (recorder.state !== 'inactive') {
                    recorder.stop();
                }
            }

            try {
                return await stopped;
            } finally {
                stopCapture?.();
            }
        }

        function triggerVideoDownload(blob) {
            if (!blob) {
                throw new Error('Nothing to download.');
            }
            const mimeType = blob.type || 'video/mp4';
            const extension = mimeType.includes('webm') ? 'webm' : 'mp4';
            const downloadURL = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = downloadURL;
            anchor.download = `timeline-export-${Date.now()}.${extension}`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(downloadURL);
        }

        function getTimelineFractionForTime(timeMs) {
            const total = getTotalTimelineDuration();
            if (!total) {
                return 0;
            }
            return clampProgress(Math.max(0, timeMs) / total);
        }

        function scrollTimelineItemIntoView(timelineItem) {
            if (!timelineItem) {
                return;
            }
            timelineItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }

        function getDragAfterElement(container, clientX) {
            const siblings = Array.from(
                container.querySelectorAll('.timeline-item:not(.dragging)'),
            );

            return siblings.reduce(
                (closest, child) => {
                    const box = child.getBoundingClientRect();
                    const offset = clientX - box.left - box.width / 2;
                    if (offset < 0 && offset > closest.offset) {
                        return { offset, element: child };
                    }
                    return closest;
                },
                { offset: Number.NEGATIVE_INFINITY, element: null },
            ).element;
        }

        function updateActiveTimelineIndicators() {
            applyTimelineProgressGeometry();

            if (isTimelinePlaying) {
                updatePlaybackTimeDisplay(playbackDisplayCurrentMs, getTotalTimelineDuration());
                return;
            }

            if (activeTimelineItem) {
                const startTime = getTimelineItemStartTime(activeTimelineItem);
                const total = getTotalTimelineDuration();
                resetTimelineProgressLine(getTimelineFractionForTime(startTime));
                updatePlaybackTimeDisplay(startTime, total);
            } else {
                resetTimelineProgressLine();
                updatePlaybackTimeDisplay(0, getTotalTimelineDuration());
            }
        }

        function getTimelineItemDurationKey(timelineItem) {
            if (!timelineItem) {
                return null;
            }
            const fileType = timelineItem.dataset.fileType || '';
            if (fileType.startsWith('image/')) {
                return 'imageDuration';
            }
            if (fileType.startsWith('video/')) {
                return 'videoDuration';
            }
            return null;
        }

        function getTimelineItemMinimumDuration(timelineItem) {
            if (!timelineItem) {
                return MIN_IMAGE_DURATION;
            }
            const fileType = timelineItem.dataset.fileType || '';
            if (fileType.startsWith('video/')) {
                const minimum = Number(timelineItem.dataset.minVideoDuration);
                if (Number.isFinite(minimum) && minimum > 0) {
                    return minimum;
                }
            }
            return MIN_IMAGE_DURATION;
        }

        function getTimelineItemResizeEdgeFromEvent(event, timelineItem) {
            if (!timelineItem) {
                return null;
            }

            const rect = timelineItem.getBoundingClientRect();
            if (!rect || !Number.isFinite(rect.width) || rect.width <= 0) {
                return null;
            }

            const threshold = Math.min(Math.max(rect.width * 0.25, 10), 22);
            const offsetX = event.clientX - rect.left;
            if (!Number.isFinite(offsetX)) {
                return null;
            }

            if (offsetX <= threshold) {
                return 'left';
            }

            if (offsetX >= rect.width - threshold) {
                return 'right';
            }

            return null;
        }

        function startTimelineItemResize(event, timelineItem, resizeEdgeOverride = null) {
            if (!timelineItem) {
                return;
            }

            const durationKey = getTimelineItemDurationKey(timelineItem);
            if (!durationKey) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            stopTimelinePlayback();
            setActiveTimelineItem(timelineItem);

            const handle = event.currentTarget;
            const resizeEdge = resizeEdgeOverride
                || handle?.dataset?.resizeEdge
                || getTimelineItemResizeEdgeFromEvent(event, timelineItem)
                || 'right';
            const isLeftResize = resizeEdge === 'left';

            const initialRect = timelineItem.getBoundingClientRect();
            const initialWidth = initialRect.width;
            const startX = event.clientX;
            const previousDraggable = timelineItem.draggable;
            const initialScrollLeft = timelineTrack ? timelineTrack.scrollLeft : 0;

            const autoScrollMargin = 60;
            const autoScrollSpeed = 16;

            timelineItem.classList.add('is-resizing');
            timelineItem.draggable = false;
            timelineItem.dataset.resizeCursor = resizeEdge;

            const captureTarget = handle instanceof HTMLElement && handle !== timelineItem
                ? handle
                : timelineItem;
            captureTarget?.setPointerCapture?.(event.pointerId);

            const onPointerMove = (moveEvent) => {
                if (timelineTrack) {
                    const trackRect = timelineTrack.getBoundingClientRect();
                    if (moveEvent.clientX > trackRect.right - autoScrollMargin) {
                        timelineTrack.scrollLeft += autoScrollSpeed;
                    } else if (moveEvent.clientX < trackRect.left + autoScrollMargin) {
                        timelineTrack.scrollLeft = Math.max(
                            0,
                            timelineTrack.scrollLeft - autoScrollSpeed,
                        );
                    }
                }

                const currentScrollLeft = timelineTrack ? timelineTrack.scrollLeft : initialScrollLeft;
                const scrollDelta = currentScrollLeft - initialScrollLeft;
                let deltaX = moveEvent.clientX - startX + scrollDelta;
                if (isLeftResize) {
                    deltaX = -deltaX;
                }
                const tentativeWidth = Math.max(MIN_TIMELINE_ITEM_WIDTH, initialWidth + deltaX);
                const nextDuration = widthToDuration(tentativeWidth);
                setTimelineItemDuration(timelineItem, durationKey, nextDuration, { markCustom: true });
                updateActiveTimelineIndicators();
            };

            const finishResize = () => {
                captureTarget?.releasePointerCapture?.(event.pointerId);
                document.removeEventListener('pointermove', onPointerMove);
                document.removeEventListener('pointerup', finishResize);
                document.removeEventListener('pointercancel', finishResize);
                timelineItem.classList.remove('is-resizing');
                timelineItem.draggable = previousDraggable;
                delete timelineItem.dataset.resizeCursor;
                updateActiveTimelineIndicators();
            };

            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', finishResize);
            document.addEventListener('pointercancel', finishResize);
        }

        function attachResizeHandles(timelineItem) {
            if (!timelineItem || timelineItem.dataset.resizeHandlesAttached === '1') {
                return;
            }

            timelineItem.dataset.resizeHandlesAttached = '1';

            ['left', 'right'].forEach((position) => {
                const handle = document.createElement('span');
                handle.className = `timeline-resize-handle ${position}`;
                handle.setAttribute('aria-hidden', 'true');
                handle.dataset.resizeEdge = position;
                handle.title = 'Drag side to adjust clip duration';
                handle.addEventListener('pointerdown', (event) => startTimelineItemResize(event, timelineItem, position));
                timelineItem.appendChild(handle);
            });
        }

        function enableTimelineItemEdgeResizing(timelineItem) {
            if (!timelineItem || timelineItem.dataset.edgeResizeInitialized === '1') {
                return;
            }

            timelineItem.dataset.edgeResizeInitialized = '1';

            const clearCursor = () => {
                if (!timelineItem.classList.contains('is-resizing')) {
                    delete timelineItem.dataset.resizeCursor;
                }
            };

            timelineItem.addEventListener('pointermove', (event) => {
                if (timelineItem.classList.contains('is-resizing')) {
                    return;
                }
                const edge = getTimelineItemResizeEdgeFromEvent(event, timelineItem);
                if (edge) {
                    timelineItem.dataset.resizeCursor = edge;
                } else {
                    delete timelineItem.dataset.resizeCursor;
                }
            });

            timelineItem.addEventListener('pointerleave', clearCursor);

            timelineItem.addEventListener('pointerdown', (event) => {
                if (event.button && event.button !== 0) {
                    return;
                }
                const edge = getTimelineItemResizeEdgeFromEvent(event, timelineItem);
                if (!edge) {
                    return;
                }
                startTimelineItemResize(event, timelineItem, edge);
            });
        }

        function enableTimelineItemDragging(timelineItem) {
            if (!timelineItem || timelineItem.dataset.draggingInitialized === '1') {
                return;
            }
            timelineItem.dataset.draggingInitialized = '1';
            timelineItem.setAttribute('draggable', 'true');

            timelineItem.addEventListener('dragstart', (event) => {
                stopTimelinePlayback();
                timelineItem.classList.add('dragging');
                const transfer = event.dataTransfer;
                if (transfer) {
                    transfer.effectAllowed = 'move';
                    transfer.setData('text/plain', timelineItem.dataset.objectUrl || 'timeline-item');
                }
            });

            timelineItem.addEventListener('dragend', () => {
                timelineItem.classList.remove('dragging');
                timelineItem.draggable = true;
                updateActiveTimelineIndicators();
            });
        }

        function initializeTimelineItem(timelineItem) {
            if (!timelineItem) {
                return;
            }
            const durationKey = getTimelineItemDurationKey(timelineItem);
            if (durationKey) {
                const duration = getTimelineItemPlaybackDuration(timelineItem);
                updateTimelineItemDurationBadge(timelineItem, duration);
            }
            enableTimelineItemDragging(timelineItem);
            const fileType = timelineItem.dataset.fileType || '';
            if (fileType.startsWith('image/') || fileType.startsWith('video/')) {
                attachResizeHandles(timelineItem);
                enableTimelineItemEdgeResizing(timelineItem);
            }
        }

        if (timelineTrack) {
            timelineTrack.addEventListener('dragenter', (event) => {
                const draggingItem = timelineTrack.querySelector('.timeline-item.dragging');
                if (draggingItem) {
                    event.preventDefault();
                }
            });

            timelineTrack.addEventListener('dragover', (event) => {
                const draggingItem = timelineTrack.querySelector('.timeline-item.dragging');
                if (!draggingItem) {
                    return;
                }
                event.preventDefault();
                const afterElement = getDragAfterElement(timelineTrack, event.clientX);
                if (!afterElement) {
                    timelineTrack.appendChild(draggingItem);
                } else if (afterElement !== draggingItem) {
                    timelineTrack.insertBefore(draggingItem, afterElement);
                }
            });

            timelineTrack.addEventListener('drop', (event) => {
                event.preventDefault();
                const draggingItem = timelineTrack.querySelector('.timeline-item.dragging');
                if (draggingItem) {
                    draggingItem.classList.remove('dragging');
                }
                updateActiveTimelineIndicators();
            });
        }

        if (window.ResizeObserver) {
            if (previewArea && !previewAreaResizeObserver) {
                previewAreaResizeObserver = new ResizeObserver(() => {
                    schedulePreviewViewportSizeUpdate();
                });
                previewAreaResizeObserver.observe(previewArea);
            }
            if (timelineTrack && !timelineTrackResizeObserver) {
                timelineTrackResizeObserver = new ResizeObserver(() => {
                    scheduleTimelineIndicatorUpdate();
                });
                timelineTrackResizeObserver.observe(timelineTrack);
            }
        }

        window.addEventListener('resize', () => {
            schedulePreviewViewportSizeUpdate();
            scheduleTimelineIndicatorUpdate();
        });

        function setPreviewMode(mode) {
            if (!previewArea) {
                return;
            }
            previewArea.classList.remove('has-video', 'has-image');
            if (mode) {
                previewArea.classList.add(mode);
            }
        }

        function resetPreviewScroll() {
            if (!previewArea) {
                return;
            }
            previewArea.scrollTop = 0;
            previewArea.scrollLeft = 0;
        }

        function parseAspectRatio(value) {
            const [rawWidth, rawHeight] = String(value).split(':');
            const width = Number(rawWidth);
            const height = Number(rawHeight);
            if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
                return width / height;
            }
            return 16 / 9;
        }

        function updatePreviewViewportSize() {
            if (!previewArea || !previewViewport) {
                return;
            }

            const computedStyle = window.getComputedStyle(previewArea);
            const paddingLeft = Number.parseFloat(computedStyle.paddingLeft) || 0;
            const paddingRight = Number.parseFloat(computedStyle.paddingRight) || 0;
            const paddingTop = Number.parseFloat(computedStyle.paddingTop) || 0;
            const paddingBottom = Number.parseFloat(computedStyle.paddingBottom) || 0;

            const availableWidth = Math.max(0, previewArea.clientWidth - paddingLeft - paddingRight);
            const availableHeight = Math.max(0, previewArea.clientHeight - paddingTop - paddingBottom);

            if (availableWidth <= 0 || availableHeight <= 0) {
                previewViewport.style.removeProperty('width');
                previewViewport.style.removeProperty('height');
                return;
            }

            const aspectRatio = currentPreviewAspectRatio > 0 ? currentPreviewAspectRatio : 16 / 9;
            let nextWidth = availableWidth;
            let nextHeight = nextWidth / aspectRatio;

            if (nextHeight > availableHeight) {
                nextHeight = availableHeight;
                nextWidth = nextHeight * aspectRatio;
            }

            previewViewport.style.width = `${nextWidth}px`;
            previewViewport.style.height = `${nextHeight}px`;
        }

        function schedulePreviewViewportSizeUpdate() {
            if (previewViewportResizeFrame !== null) {
                return;
            }
            previewViewportResizeFrame = window.requestAnimationFrame(() => {
                previewViewportResizeFrame = null;
                updatePreviewViewportSize();
            });
        }

        if (previewImage) {
            previewImage.addEventListener('load', () => {
                resetPreviewScroll();
                schedulePreviewViewportSizeUpdate();
            });
        }

        if (previewVideo) {
            previewVideo.addEventListener('loadeddata', () => {
                schedulePreviewViewportSizeUpdate();
            });
        }

        function setPreviewAspect(aspectValue) {
            if (!previewArea) {
                return;
            }

            const normalized = aspectValue === '9:16' ? '9 / 16' : '16 / 9';
            currentPreviewAspectRatio = parseAspectRatio(aspectValue);
            previewArea.style.setProperty('--preview-aspect-ratio', normalized);
            if (previewViewport) {
                previewViewport.style.setProperty('--preview-aspect-ratio', normalized);
            }
            schedulePreviewViewportSizeUpdate();
        }

        if (previewAspectSelect) {
            previewAspectSelect.addEventListener('change', (event) => {
                setPreviewAspect(event.target.value);
            });
            setPreviewAspect(previewAspectSelect.value);
        } else {
            setPreviewAspect('16:9');
        }

        function clampProgress(value) {
            return Math.min(Math.max(value, 0), 1);
        }

        function updateTimelineProgressInput(fraction) {
            if (!timelineProgressInput) {
                return;
            }
            timelineProgressInput.value = String(Math.round(clampProgress(fraction) * 100));
        }

        function getTimelineProgressGeometry() {
            if (!timelineTrack) {
                return { offset: 0, width: 0 };
            }

            const items = getTimelineItems();
            if (!items.length) {
                const computedStyle = window.getComputedStyle(timelineTrack);
                const paddingLeft = Number.parseFloat(computedStyle.paddingLeft) || 0;
                const paddingRight = Number.parseFloat(computedStyle.paddingRight) || 0;
                const width = Math.max(0, timelineTrack.clientWidth - paddingLeft - paddingRight);
                return { offset: paddingLeft, width };
            }

            const firstItem = items[0];
            const lastItem = items[items.length - 1];
            const offset = firstItem.offsetLeft;
            const width = (lastItem.offsetLeft + lastItem.offsetWidth) - offset;
            return { offset, width: Math.max(0, width) };
        }

        function applyTimelineProgressGeometry() {
            if (!timelineProgressLine || !timelineTrack) {
                return 0;
            }

            const { offset, width } = getTimelineProgressGeometry();
            timelineProgressLine.style.setProperty('--timeline-progress-offset', `${offset}px`);
            timelineProgressLine.style.setProperty('--timeline-progress-span', `${width}px`);
            return width;
        }

        function scheduleTimelineIndicatorUpdate() {
            if (timelineIndicatorResizeFrame !== null) {
                return;
            }
            timelineIndicatorResizeFrame = window.requestAnimationFrame(() => {
                timelineIndicatorResizeFrame = null;
                updateActiveTimelineIndicators();
            });
        }

        function resetTimelineProgressLine(fraction = 0) {
            if (!timelineProgressLine) {
                updateTimelineProgressInput(0);
                return;
            }
            const width = applyTimelineProgressGeometry();
            const clamped = width > 0 ? clampProgress(fraction) : 0;
            timelineProgressLine.dataset.progress = String(clamped);
            timelineProgressLine.style.transition = 'none';
            timelineProgressLine.style.transform = `scaleX(${clamped})`;
            updateTimelineProgressInput(clamped);
        }

        function animateTimelineProgress(startFraction, endFraction, durationMs) {
            if (!timelineProgressLine) {
                updateTimelineProgressInput(endFraction);
                return;
            }
            const width = applyTimelineProgressGeometry();
            const hasSpan = width > 0;
            const start = hasSpan ? clampProgress(startFraction) : 0;
            const end = hasSpan ? clampProgress(endFraction) : 0;
            timelineProgressLine.dataset.progress = String(end);
            timelineProgressLine.style.transition = 'none';
            timelineProgressLine.style.transform = `scaleX(${start})`;
            void timelineProgressLine.offsetWidth;
            if (durationMs > 0 && hasSpan) {
                timelineProgressLine.style.transition = `transform ${durationMs}ms linear`;
            } else {
                timelineProgressLine.style.transition = 'none';
            }
            timelineProgressLine.style.transform = `scaleX(${end})`;
            updateTimelineProgressInput(end);
        }

        function getTimelineItemPlaybackDuration(timelineItem) {
            const fileType = timelineItem.dataset.fileType || '';
            if (fileType.startsWith('image/')) {
                const duration = Number(timelineItem.dataset.imageDuration);
                if (Number.isFinite(duration) && duration > 0) {
                    return duration;
                }
                return IMAGE_FRAME_DURATION;
            }
            if (fileType.startsWith('video/')) {
                const duration = Number(timelineItem.dataset.videoDuration);
                if (Number.isFinite(duration) && duration > 0) {
                    return duration;
                }
            }
            return 0;
        }

        resetTimelineProgressLine();
        updateActiveTimelineIndicators();

        function stopTimelinePlayback(resetButton = true, resetProgress = true) {
            const abort = timelinePlaybackAbort;
            timelinePlaybackAbort = null;

            if (typeof abort === 'function') {
                abort();
            }

            const wasPlaying = isTimelinePlaying;
            isTimelinePlaying = false;

            stopPlaybackClock(resetProgress);

            if (resetProgress) {
                resetTimelineProgressLine();
            }

            if (!previewVideo.paused) {
                previewVideo.pause();
            }

            if (resetProgress) {
                previewVideo.currentTime = 0;
            }

            if (resetButton) {
                playVideoButton.textContent = 'Play Back';
            }
        }

        function clearPreview() {
            stopTimelinePlayback();
            previewVideo.pause();
            previewVideo.hidden = true;
            previewVideo.removeAttribute('src');
            previewVideo.load();
            previewImage.hidden = true;
            previewImage.removeAttribute('src');
            previewPlaceholder.hidden = false;
            playVideoButton.textContent = 'Play Back';
            setPreviewMode(null);
            resetPreviewScroll();
            setActiveTimelineItem(null);
        }

        function setActiveTimelineItem(item) {
            if (activeTimelineItem) {
                activeTimelineItem.classList.remove('active');
            }
            activeTimelineItem = item || null;
            if (activeTimelineItem) {
                activeTimelineItem.classList.add('active');
                scrollTimelineItemIntoView(activeTimelineItem);
            }
            updateActiveTimelineIndicators();
        }

        function loadPreviewFromTimeline(timelineItem) {
            if (!timelineItem) {
                clearPreview();
                return;
            }

            const fileType = timelineItem.dataset.fileType || '';
            const objectURL = timelineItem.dataset.objectUrl;

            if (!objectURL) {
                return;
            }

            previewPlaceholder.hidden = true;

            if (isTimelinePlaying) {
                stopTimelinePlayback();
            }

            if (fileType.startsWith('video/')) {
                setPreviewMode('has-video');
                resetPreviewScroll();
                previewImage.hidden = true;
                previewImage.removeAttribute('src');
                previewVideo.hidden = false;
                if (previewVideo.src !== objectURL) {
                    previewVideo.pause();
                    previewVideo.src = objectURL;
                    previewVideo.load();
                }
                playVideoButton.textContent = 'Play Back';
            } else if (fileType.startsWith('image/')) {
                setPreviewMode('has-image');
                previewVideo.pause();
                previewVideo.hidden = true;
                previewVideo.removeAttribute('src');
                previewImage.hidden = false;
                if (previewImage.src !== objectURL) {
                    previewImage.src = objectURL;
                }
                resetPreviewScroll();
                playVideoButton.textContent = 'Play Back';
            }
        }

        async function showPreview(file) {
            const isVideo = file.type.startsWith('video/');
            const isImage = file.type.startsWith('image/');

            if (!isVideo && !isImage) {
                alert('Unsupported file type. Please upload an image or video file.');
                return;
            }

            const objectURL = URL.createObjectURL(file);
            await addToTimeline(file, objectURL);
        }

        async function generateImageThumbnail(objectURL, maxWidth = 90, maxHeight = 60) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
                    const width = Math.max(1, Math.round(img.width * scale));
                    const height = Math.max(1, Math.round(img.height * scale));

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        resolve(objectURL);
                        return;
                    }
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/png'));
                };
                img.onerror = () => resolve(objectURL);
                img.src = objectURL;
            });
        }

        async function addToTimeline(file, objectURL) {
            if (timelineEmptyState) {
                timelineEmptyState.remove();
            }

            const timelineItem = document.createElement('div');
            timelineItem.className = 'timeline-item';
            timelineItem.dataset.fileType = file.type;
            timelineItem.dataset.objectUrl = objectURL;

            const label = document.createElement('span');
            label.textContent = file.name;

            if (file.type.startsWith('video/')) {
                const videoThumb = document.createElement('video');
                videoThumb.src = objectURL;
                videoThumb.muted = true;
                videoThumb.loop = true;
                videoThumb.playsInline = true;
                videoThumb.autoplay = true;
                timelineItem.dataset.minVideoDuration = String(DEFAULT_VIDEO_DURATION);
                setTimelineItemDuration(
                    timelineItem,
                    'videoDuration',
                    DEFAULT_VIDEO_DURATION,
                    { markCustom: false },
                );
                videoThumb.addEventListener('loadedmetadata', () => {
                    if (Number.isFinite(videoThumb.duration) && videoThumb.duration > 0) {
                        const intrinsicDuration = Math.round(videoThumb.duration * 1000);
                        timelineItem.dataset.minVideoDuration = String(intrinsicDuration);
                        const currentDuration = Number(timelineItem.dataset.videoDuration);
                        const hasCustomDuration = timelineItem.dataset.customDuration === '1';
                        const nextDuration = hasCustomDuration && Number.isFinite(currentDuration)
                            && currentDuration > 0
                                ? Math.max(currentDuration, intrinsicDuration)
                                : intrinsicDuration;
                        const appliedDuration = setTimelineItemDuration(
                            timelineItem,
                            'videoDuration',
                            nextDuration,
                            { markCustom: hasCustomDuration },
                        );
                        if (appliedDuration !== currentDuration) {
                            updateActiveTimelineIndicators();
                        }
                    }
                });
                timelineItem.appendChild(videoThumb);
            } else if (file.type.startsWith('image/')) {
                const imageThumb = document.createElement('img');
                imageThumb.className = 'timeline-thumbnail';
                imageThumb.src = await generateImageThumbnail(objectURL);
                imageThumb.alt = file.name;
                timelineItem.appendChild(imageThumb);
                setTimelineItemDuration(
                    timelineItem,
                    'imageDuration',
                    IMAGE_FRAME_DURATION,
                    { markCustom: false },
                );
            }

            timelineItem.appendChild(label);
            timelineTrack.appendChild(timelineItem);
            initializeTimelineItem(timelineItem);

            timelineItem.addEventListener('click', () => {
                stopTimelinePlayback();
                setActiveTimelineItem(timelineItem);
                loadPreviewFromTimeline(timelineItem);
            });

            setActiveTimelineItem(timelineItem);
            loadPreviewFromTimeline(timelineItem);
        }

        uploadInput.addEventListener('change', async (event) => {
            const files = Array.from(event.target.files || []);
            if (!files.length) {
                return;
            }

            for (const file of files) {
                // eslint-disable-next-line no-await-in-loop
                await showPreview(file);
            }
        });

        uploadButton.addEventListener('click', () => uploadInput.click());

        async function playTimelineItem(timelineItem) {
            const fileType = timelineItem.dataset.fileType || '';
            const objectURL = timelineItem.dataset.objectUrl;

            if (!objectURL) {
                return;
            }

            setActiveTimelineItem(timelineItem);

            if (fileType.startsWith('video/')) {
                setPreviewMode('has-video');
                resetPreviewScroll();
                previewImage.hidden = true;
                previewImage.removeAttribute('src');
                previewVideo.hidden = false;
                previewPlaceholder.hidden = true;

                await new Promise((resolve) => {
                    let resolved = false;
                    let timeoutId = 0;
                    let onEnded = null;
                    let onError = null;
                    let onLoaded = null;

                    const cleanup = () => {
                        if (onEnded) {
                            previewVideo.removeEventListener('ended', onEnded);
                        }
                        if (onLoaded) {
                            previewVideo.removeEventListener('loadeddata', onLoaded);
                        }
                        if (onError) {
                            previewVideo.removeEventListener('error', onError);
                        }
                    };

                    const finalize = () => {
                        if (resolved) {
                            return;
                        }
                        resolved = true;
                        window.clearTimeout(timeoutId);
                        cleanup();
                        previewVideo.pause();
                        previewVideo.loop = false;
                        previewVideo.currentTime = 0;
                        if (timelinePlaybackAbort === abortPlayback) {
                            timelinePlaybackAbort = null;
                        }
                        resolve();
                    };

                    const ensureVideoDuration = () => {
                        const intrinsic = Number.isFinite(previewVideo.duration)
                            && previewVideo.duration > 0
                            ? Math.round(previewVideo.duration * 1000)
                            : 0;
                        if (intrinsic > 0) {
                            timelineItem.dataset.minVideoDuration = String(intrinsic);
                        }
                        const minimum = getTimelineItemMinimumDuration(timelineItem);
                        const currentDuration = Number(timelineItem.dataset.videoDuration);
                        const nextDuration = Number.isFinite(currentDuration) && currentDuration > 0
                            ? Math.max(currentDuration, minimum)
                            : minimum;
                        if (nextDuration !== currentDuration) {
                            setTimelineItemDuration(timelineItem, 'videoDuration', nextDuration);
                            updateActiveTimelineIndicators();
                        } else {
                            updateTimelineItemDurationBadge(timelineItem, nextDuration);
                        }
                        return {
                            intrinsicDuration: intrinsic,
                            targetDuration: nextDuration,
                        };
                    };

                    const beginPlayback = () => {
                        if (!isTimelinePlaying) {
                            finalize();
                            return;
                        }
                        const { intrinsicDuration, targetDuration } = ensureVideoDuration();
                        const shouldLoop = intrinsicDuration > 0 && targetDuration > intrinsicDuration + 50;
                        previewVideo.loop = shouldLoop;
                        window.clearTimeout(timeoutId);
                        if (targetDuration > 0) {
                            timeoutId = window.setTimeout(() => {
                                finalize();
                            }, targetDuration);
                        }
                        previewVideo.currentTime = 0;
                        const playPromise = previewVideo.play();
                        if (playPromise && typeof playPromise.then === 'function') {
                            playPromise.catch(() => finalize());
                        }
                    };

                    onEnded = () => {
                        if (!previewVideo.loop) {
                            finalize();
                        }
                    };

                    onLoaded = () => {
                        previewVideo.removeEventListener('loadeddata', onLoaded);
                        onLoaded = null;
                        beginPlayback();
                    };

                    onError = () => {
                        finalize();
                    };

                    const abortPlayback = () => {
                        finalize();
                    };

                    timelinePlaybackAbort = abortPlayback;

                    previewVideo.addEventListener('ended', onEnded);
                    previewVideo.addEventListener('error', onError, { once: true });
                    previewVideo.addEventListener('loadeddata', onLoaded, { once: true });

                    if (previewVideo.src !== objectURL) {
                        previewVideo.pause();
                        previewVideo.src = objectURL;
                        previewVideo.load();
                    } else if (previewVideo.readyState >= 2) {
                        beginPlayback();
                    } else {
                        previewVideo.load();
                    }
                });
            } else if (fileType.startsWith('image/')) {
                setPreviewMode('has-image');
                previewVideo.pause();
                previewVideo.hidden = true;
                previewVideo.removeAttribute('src');
                previewImage.hidden = false;
                previewPlaceholder.hidden = true;
                if (previewImage.src !== objectURL) {
                    previewImage.src = objectURL;
                }
                resetPreviewScroll();

                await new Promise((resolve) => {
                    let resolved = false;
                    const timeoutId = window.setTimeout(() => {
                        if (resolved) {
                            return;
                        }
                        resolved = true;
                        if (timelinePlaybackAbort === abortPlayback) {
                            timelinePlaybackAbort = null;
                        }
                        resolve();
                    }, Number(timelineItem.dataset.imageDuration) || IMAGE_FRAME_DURATION);

                    const abortPlayback = () => {
                        if (resolved) {
                            return;
                        }
                        resolved = true;
                        window.clearTimeout(timeoutId);
                        timelinePlaybackAbort = null;
                        resolve();
                    };

                    timelinePlaybackAbort = abortPlayback;
                });
            }
        }

        async function playTimelineSequence(startIndex = 0) {
            const timelineItems = getTimelineItems();
            if (!timelineItems.length) {
                alert('Upload an image or video to build your timeline.');
                return;
            }

            const initialIndex = Math.min(Math.max(0, startIndex), timelineItems.length - 1);
            const totalDuration = Math.max(getTotalTimelineDuration(), 0);
            const initialItem = timelineItems[initialIndex];
            const startElapsed = initialItem ? getTimelineItemStartTime(initialItem) : 0;

            isTimelinePlaying = true;
            playVideoButton.textContent = 'Pause playback';
            resetTimelineProgressLine(getTimelineFractionForTime(startElapsed));
            updatePlaybackTimeDisplay(startElapsed, totalDuration);
            startPlaybackClock(startElapsed, totalDuration);

            let timelineOffset = startElapsed;
            let completedNaturally = true;

            try {
                for (let index = initialIndex; index < timelineItems.length; index += 1) {
                    if (!isTimelinePlaying) {
                        completedNaturally = false;
                        break;
                    }
                    const timelineItem = timelineItems[index];
                    const duration = getTimelineItemPlaybackDuration(timelineItem);
                    const startFraction = getTimelineFractionForTime(timelineOffset);
                    const endFraction = getTimelineFractionForTime(timelineOffset + duration);
                    animateTimelineProgress(startFraction, endFraction, duration);
                    // eslint-disable-next-line no-await-in-loop
                    await playTimelineItem(timelineItem);
                    timelineOffset += duration;
                }
            } finally {
                stopTimelinePlayback(true, false);
                if (completedNaturally) {
                    resetTimelineProgressLine(1);
                    updatePlaybackTimeDisplay(totalDuration, totalDuration);
                } else {
                    updateActiveTimelineIndicators();
                }
            }
        }

        exportButton?.addEventListener('click', () => {
            const timelineItems = getTimelineItems();
            if (!timelineItems.length) {
                alert('Upload an image or video to build your timeline.');
                return;
            }

            const target = ensurePreviewHasActiveItem();
            const summary = collectTimelineSummary();
            openExportModal(summary);

            if (!isTimelinePlaying && target) {
                const startIndex = Math.max(0, getTimelineItems().indexOf(target));
                void playTimelineSequence(startIndex);
            }
        });

        exportCancelButton?.addEventListener('click', () => {
            closeExportModal();
            stopTimelinePlayback();
        });

        exportConfirmButton?.addEventListener('click', async () => {
            const timelineItems = getTimelineItems();
            if (!timelineItems.length) {
                updateExportStatus('Add clips to the timeline before exporting.', 'error');
                return;
            }

            exportConfirmButton.disabled = true;
            exportCancelButton.disabled = true;
            updateExportStatus('Preparing your export. Please keep this tab open…');

            try {
                const target = ensurePreviewHasActiveItem();
                if (!target) {
                    throw new Error('No preview is available to export.');
                }

                stopTimelinePlayback(true, true);
                const blob = await recordTimelinePlaybackToBlob();
                triggerVideoDownload(blob);
                updateExportStatus('Export complete! Your MP4 download should begin automatically.', 'success');
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Export failed. Please try again.';
                updateExportStatus(message, 'error');
            } finally {
                exportConfirmButton.disabled = false;
                exportCancelButton.disabled = false;
            }
        });

        playVideoButton.addEventListener('click', () => {
            if (isTimelinePlaying) {
                stopTimelinePlayback();
                return;
            }

            const timelineItems = getTimelineItems();
            if (!timelineItems.length) {
                alert('Upload an image or video to build your timeline.');
                return;
            }

            const startIndex = activeTimelineItem ? timelineItems.indexOf(activeTimelineItem) : 0;
            playTimelineSequence(startIndex >= 0 ? startIndex : 0);
        });

        previewVideo.addEventListener('ended', () => {
            if (isTimelinePlaying) {
                return;
            }
            playVideoButton.textContent = 'Play Back';
            previewVideo.currentTime = 0;
        });
    </script>
</body>
</html>
'''
