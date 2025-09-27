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
        .settings-card select {
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
        .settings-card select:focus {
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
            position: relative;
            --preview-aspect-ratio: 16 / 9;
            aspect-ratio: var(--preview-aspect-ratio);
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
            transition: aspect-ratio 0.2s ease;
        }

        .preview-area.has-image,
        .preview-area.has-video {
            min-height: 0;
            align-items: center;
            justify-content: center;
        }

        .preview-area.aspect-16-9 {
            --preview-aspect-ratio: 16 / 9;
        }

        .preview-area.aspect-9-16 {
            --preview-aspect-ratio: 9 / 16;
        }

        .preview-area.aspect-4-3 {
            --preview-aspect-ratio: 4 / 3;
        }

        .preview-area video {
            width: 100%;
            height: 100%;
            object-fit: contain;
            border-radius: 20px;
        }

        .preview-area img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            border-radius: 20px;
            display: block;
        }

        .timeline-card {
            position: relative;
            overflow: hidden;
        }

        .timeline-track {
            position: relative;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
            gap: 10px;
            padding: 16px;
            border-radius: 14px;
            background: rgba(8, 12, 24, 0.75);
            border: 1px dashed rgba(148, 163, 184, 0.24);
            color: var(--text-secondary);
            text-align: center;
            font-size: 0.95rem;
            min-height: 120px;
        }

        .timeline-item {
            padding: 8px;
            border-radius: 12px;
            background: rgba(30, 41, 59, 0.7);
            border: 1px solid rgba(148, 163, 184, 0.2);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            overflow: hidden;
            cursor: pointer;
            transition: border 0.2s ease, box-shadow 0.2s ease;
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
        }

        .timeline-item video {
            background: #000;
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
            left: 16px;
            right: 16px;
            height: 3px;
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
                    <span id="preview-placeholder">Drop clips here to preview your edit</span>
                    <video id="preview-video" controls hidden></video>
                    <img id="preview-image" alt="Preview" hidden>
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
                <button type="button" id="play-video-button">Play Back</button>
            </div>
        </section>

        <footer class="footer">
            © {{ 2024 }} Video Editor Pro. Crafted for creators.
        </footer>
    </div>
    <script>
        const uploadInput = document.getElementById('video-upload');
        const uploadButton = document.getElementById('upload-button');
        const previewArea = document.querySelector('.preview-area');
        const previewVideo = document.getElementById('preview-video');
        const previewImage = document.getElementById('preview-image');
        const previewPlaceholder = document.getElementById('preview-placeholder');
        const timelineTrack = document.getElementById('timeline-track');
        const timelineEmptyState = document.getElementById('timeline-empty-state');
        const playVideoButton = document.getElementById('play-video-button');
        const timelineProgressLine = document.getElementById('timeline-progress-line');
        const timelineProgressInput = document.getElementById('timeline-progress');
        let activeTimelineItem = null;
        let isTimelinePlaying = false;
        let timelinePlaybackAbort = null;

        const IMAGE_FRAME_DURATION = 1000;
        const PREVIEW_ASPECT_CLASSES = ['aspect-16-9', 'aspect-9-16', 'aspect-4-3'];

        function setPreviewAspectClass(aspectClass) {
            if (!previewArea) {
                return;
            }
            previewArea.classList.remove(...PREVIEW_ASPECT_CLASSES);
            if (aspectClass) {
                previewArea.classList.add(aspectClass);
            }
        }

        function getClosestAspectClass(width, height) {
            if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
                return 'aspect-16-9';
            }

            const ratio = width / height;
            const options = [
                { className: 'aspect-16-9', ratio: 16 / 9 },
                { className: 'aspect-4-3', ratio: 4 / 3 },
                { className: 'aspect-9-16', ratio: 9 / 16 },
            ];

            let best = options[0];
            let smallestDiff = Math.abs(ratio - best.ratio);

            for (let index = 1; index < options.length; index += 1) {
                const option = options[index];
                const diff = Math.abs(ratio - option.ratio);
                if (diff < smallestDiff) {
                    best = option;
                    smallestDiff = diff;
                }
            }

            return best.className;
        }

        function updatePreviewAspectFromImage(img) {
            if (!img) {
                return;
            }

            const { naturalWidth, naturalHeight } = img;
            if (naturalWidth && naturalHeight) {
                setPreviewAspectClass(getClosestAspectClass(naturalWidth, naturalHeight));
            } else {
                setPreviewAspectClass('aspect-16-9');
            }
        }

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

        if (previewImage) {
            previewImage.addEventListener('load', () => {
                updatePreviewAspectFromImage(previewImage);
                resetPreviewScroll();
            });
            previewImage.addEventListener('error', () => {
                setPreviewAspectClass('aspect-16-9');
            });
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

        function resetTimelineProgressLine(fraction = 0) {
            if (!timelineProgressLine) {
                updateTimelineProgressInput(0);
                return;
            }
            const clamped = clampProgress(fraction);
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
            const start = clampProgress(startFraction);
            const end = clampProgress(endFraction);
            timelineProgressLine.dataset.progress = String(end);
            timelineProgressLine.style.transition = 'none';
            timelineProgressLine.style.transform = `scaleX(${start})`;
            void timelineProgressLine.offsetWidth;
            if (durationMs > 0) {
                timelineProgressLine.style.transition = `transform ${durationMs}ms linear`;
            } else {
                timelineProgressLine.style.transition = 'none';
            }
            timelineProgressLine.style.transform = `scaleX(${end})`;
            updateTimelineProgressInput(end);
        }

        function getTimelineItems() {
            return Array.from(timelineTrack.querySelectorAll('.timeline-item'));
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

        function stopTimelinePlayback(resetButton = true, resetProgress = true) {
            const abort = timelinePlaybackAbort;
            timelinePlaybackAbort = null;

            if (typeof abort === 'function') {
                abort();
            }

            if (resetProgress) {
                resetTimelineProgressLine();
            }

            if (!isTimelinePlaying) {
                if (resetButton) {
                    playVideoButton.textContent = 'Play Back';
                }
                return;
            }

            isTimelinePlaying = false;
            if (!previewVideo.paused) {
                previewVideo.pause();
            }
            previewVideo.currentTime = 0;

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
            setPreviewAspectClass(null);
            resetPreviewScroll();
            setActiveTimelineItem(null);
        }

        function setActiveTimelineItem(item) {
            if (activeTimelineItem) {
                activeTimelineItem.classList.remove('active');
            }
            activeTimelineItem = item;
            if (activeTimelineItem) {
                activeTimelineItem.classList.add('active');
            }
            if (!isTimelinePlaying) {
                if (activeTimelineItem) {
                    const items = getTimelineItems();
                    const index = items.indexOf(activeTimelineItem);
                    if (index >= 0 && items.length) {
                        resetTimelineProgressLine(index / items.length);
                    }
                } else {
                    resetTimelineProgressLine();
                }
            }
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
                setPreviewAspectClass('aspect-16-9');
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
                setPreviewAspectClass(null);
                previewVideo.pause();
                previewVideo.hidden = true;
                previewVideo.removeAttribute('src');
                previewImage.hidden = false;
                if (previewImage.src !== objectURL) {
                    previewImage.src = objectURL;
                } else if (previewImage.complete) {
                    updatePreviewAspectFromImage(previewImage);
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
                videoThumb.addEventListener('loadedmetadata', () => {
                    if (Number.isFinite(videoThumb.duration) && videoThumb.duration > 0) {
                        timelineItem.dataset.videoDuration = String(Math.round(videoThumb.duration * 1000));
                    }
                });
                timelineItem.appendChild(videoThumb);
            } else if (file.type.startsWith('image/')) {
                const imageThumb = document.createElement('img');
                imageThumb.className = 'timeline-thumbnail';
                imageThumb.src = await generateImageThumbnail(objectURL);
                imageThumb.alt = file.name;
                timelineItem.appendChild(imageThumb);
                timelineItem.dataset.imageDuration = String(IMAGE_FRAME_DURATION);
            }

            timelineItem.appendChild(label);
            timelineTrack.appendChild(timelineItem);

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
                setPreviewAspectClass('aspect-16-9');
                resetPreviewScroll();
                previewImage.hidden = true;
                previewImage.removeAttribute('src');
                previewVideo.hidden = false;
                previewPlaceholder.hidden = true;

                await new Promise((resolve) => {
                    let resolved = false;

                    const cleanup = () => {
                        previewVideo.removeEventListener('ended', onEnded);
                        previewVideo.removeEventListener('loadeddata', onLoaded);
                        previewVideo.removeEventListener('error', onError);
                    };

                    const finalize = () => {
                        if (resolved) {
                            return;
                        }
                        resolved = true;
                        cleanup();
                        if (timelinePlaybackAbort === abortPlayback) {
                            timelinePlaybackAbort = null;
                        }
                        resolve();
                    };

                    const onEnded = () => {
                        finalize();
                    };

                    const onLoaded = () => {
                        previewVideo.removeEventListener('loadeddata', onLoaded);
                        if (!isTimelinePlaying) {
                            finalize();
                            return;
                        }
                        if (Number.isFinite(previewVideo.duration) && previewVideo.duration > 0) {
                            timelineItem.dataset.videoDuration = String(Math.round(previewVideo.duration * 1000));
                        }
                        previewVideo.currentTime = 0;
                        const playPromise = previewVideo.play();
                        if (playPromise && typeof playPromise.then === 'function') {
                            playPromise.catch(() => finalize());
                        }
                    };

                    const onError = () => {
                        finalize();
                    };

                    const abortPlayback = () => {
                        cleanup();
                        previewVideo.pause();
                        previewVideo.currentTime = 0;
                        finalize();
                    };

                    timelinePlaybackAbort = abortPlayback;

                    previewVideo.addEventListener('ended', onEnded, { once: true });
                    previewVideo.addEventListener('error', onError, { once: true });
                    previewVideo.addEventListener('loadeddata', onLoaded, { once: true });

                    if (previewVideo.src !== objectURL) {
                        previewVideo.pause();
                        previewVideo.src = objectURL;
                        previewVideo.load();
                    } else if (previewVideo.readyState >= 2) {
                        onLoaded();
                    } else {
                        previewVideo.load();
                    }
                });
            } else if (fileType.startsWith('image/')) {
                setPreviewMode('has-image');
                setPreviewAspectClass(null);
                previewVideo.pause();
                previewVideo.hidden = true;
                previewVideo.removeAttribute('src');
                previewImage.hidden = false;
                previewPlaceholder.hidden = true;
                if (previewImage.src !== objectURL) {
                    previewImage.src = objectURL;
                } else if (previewImage.complete) {
                    updatePreviewAspectFromImage(previewImage);
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

            const initialIndex = Math.max(0, startIndex);
            const totalItems = timelineItems.length;
            const startFraction = totalItems ? initialIndex / totalItems : 0;

            isTimelinePlaying = true;
            playVideoButton.textContent = 'Pause playback';
            resetTimelineProgressLine(startFraction);

            try {
                for (let index = initialIndex; index < totalItems; index += 1) {
                    if (!isTimelinePlaying) {
                        break;
                    }
                    const timelineItem = timelineItems[index];
                    const duration = getTimelineItemPlaybackDuration(timelineItem);
                    animateTimelineProgress(index / totalItems, (index + 1) / totalItems, duration);
                    // eslint-disable-next-line no-await-in-loop
                    await playTimelineItem(timelineItem);
                }
            } finally {
                stopTimelinePlayback(true, false);
            }
        }

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
