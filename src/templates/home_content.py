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
            padding: clamp(16px, 3vh, 24px);
        }

        .app-shell {
            width: min(1200px, 100%);
            display: grid;
            grid-template-columns: 1fr;
            gap: clamp(18px, 3vh, 24px);
        }

        .nav-bar {
            background: rgba(17, 24, 39, 0.85);
            backdrop-filter: blur(14px);
            border-radius: 22px;
            padding: clamp(14px, 2.5vh, 18px) clamp(20px, 4vw, 28px);
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

        .nav-actions a,
        .nav-actions button {
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
            cursor: pointer;
            font-family: inherit;
        }

        .nav-actions a.primary,
        .nav-actions button.primary {
            background: linear-gradient(135deg, rgba(124, 58, 237, 0.95), rgba(56, 189, 248, 0.9));
            color: #0f172a;
            font-weight: 600;
            border: none;
            box-shadow: 0 10px 30px rgba(56, 189, 248, 0.28);
        }

        .nav-actions a:hover,
        .nav-actions button:hover {
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
            gap: clamp(16px, 3vw, 24px);
            grid-template-columns: minmax(0, 0.85fr) minmax(0, 2fr) minmax(0, 0.85fr);
            grid-template-areas: "upload preview settings";
            align-items: stretch;
        }

        .editor-layout > .panel {
            height: 100%;
        }

        .upload-card {
            grid-area: upload;
        }

        .preview-card {
            grid-area: preview;
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(4px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .timeline-footer {
            margin-top: 12px;
        }

        .panel {
            background: rgba(17, 24, 39, 0.82);
            border-radius: 22px;
            border: 1px solid var(--border-color);
            box-shadow: var(--shadow-soft);
            padding: clamp(16px, 3vh, 24px);
            display: flex;
            flex-direction: column;
            gap: clamp(16px, 3vh, 20px);
        }

        .panel-header {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .panel h2 {
            margin: 0;
            font-size: 1.3rem;
            font-weight: 600;
            letter-spacing: -0.01em;
        }

        .panel-subtitle {
            margin: 0;
            color: var(--text-secondary);
            font-size: 0.95rem;
            line-height: 1.5;
        }

        .visually-hidden {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0 0 0 0);
            white-space: nowrap;
            border: 0;
        }

        .upload-card {
            position: relative;
            gap: 24px;
        }

        .upload-dropzone {
            position: relative;
            display: grid;
            gap: 14px;
            justify-items: center;
            padding: 28px 20px;
            border-radius: 18px;
            border: 1.5px dashed rgba(148, 163, 184, 0.32);
            background: linear-gradient(140deg, rgba(124, 58, 237, 0.08), rgba(56, 189, 248, 0.05));
            cursor: pointer;
            transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
            text-align: center;
        }

        .upload-dropzone:hover {
            border-color: rgba(124, 58, 237, 0.55);
            transform: translateY(-1px);
            box-shadow: 0 16px 40px rgba(15, 23, 42, 0.28);
        }

        .upload-dropzone__icon {
            width: 64px;
            height: 64px;
            border-radius: 18px;
            display: grid;
            place-items: center;
            background: linear-gradient(135deg, rgba(124, 58, 237, 0.35), rgba(56, 189, 248, 0.2));
            color: rgba(244, 114, 182, 0.9);
            font-size: 28px;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
        }

        .upload-dropzone__text strong {
            display: block;
            font-size: 1.05rem;
            font-weight: 600;
            color: var(--text-primary);
        }

        .upload-dropzone__text span {
            color: var(--text-secondary);
            font-size: 0.9rem;
        }

        .upload-meta {
            display: flex;
            flex-direction: column;
            gap: 6px;
            color: var(--text-secondary);
            font-size: 0.9rem;
        }

        .upload-meta__status {
            color: var(--text-primary);
            font-weight: 500;
            letter-spacing: 0.01em;
        }

        .upload-meta__hint {
            font-size: 0.85rem;
        }

        .upload-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
        }

        .upload-actions button {
            flex: 1;
            min-width: 140px;
            padding: 12px 18px;
            border-radius: 12px;
            font-weight: 600;
            font-family: inherit;
            border: none;
            cursor: pointer;
            transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
        }

        .upload-actions button:focus-visible {
            outline: 2px solid rgba(56, 189, 248, 0.6);
            outline-offset: 3px;
        }

        .upload-primary {
            background: linear-gradient(135deg, rgba(56, 189, 248, 0.95), rgba(124, 58, 237, 0.85));
            color: #081229;
            box-shadow: 0 16px 30px rgba(56, 189, 248, 0.25);
        }

        .upload-primary:hover {
            transform: translateY(-2px);
        }

        .upload-secondary {
            background: rgba(15, 23, 42, 0.75);
            border: 1px solid rgba(148, 163, 184, 0.28);
            color: var(--text-secondary);
        }

        .upload-secondary[disabled] {
            cursor: not-allowed;
            opacity: 0.6;
        }

        .upload-guidelines {
            margin: 0;
            padding-left: 18px;
            display: grid;
            gap: 6px;
            color: var(--text-secondary);
            font-size: 0.85rem;
            line-height: 1.5;
        }

        .preview-card {
            position: relative;
            gap: 24px;
        }

        .preview-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            flex-wrap: wrap;
        }

        .preview-toolbar {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 12px;
            border-radius: 12px;
            background: rgba(15, 23, 42, 0.7);
            border: 1px solid rgba(148, 163, 184, 0.22);
        }

        .preview-toolbar label {
            font-size: 0.85rem;
            color: var(--text-secondary);
            white-space: nowrap;
        }

        .preview-toolbar select {
            appearance: none;
            padding: 8px 32px 8px 12px;
            border-radius: 10px;
            border: 1px solid rgba(148, 163, 184, 0.28);
            background: rgba(15, 23, 42, 0.9) url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="%23cbd5f5"><path d="M5.23 7.21a.75.75 0 011.06.02L10 10.939l3.71-3.71a.75.75 0 011.06 1.061l-4.24 4.24a.75.75 0 01-1.06 0l-4.24-4.24a.75.75 0 01.02-1.06z"/></svg>') no-repeat right 10px center;
            background-size: 16px;
            color: var(--text-primary);
            font-size: 0.9rem;
            min-width: 150px;
        }

        .preview-toolbar select:focus {
            outline: none;
            border-color: rgba(56, 189, 248, 0.6);
            box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
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
            min-height: clamp(200px, 32vh, 280px);
            overflow: hidden;
        }

        .preview-area::after {
            content: '';
            position: absolute;
            inset: 16px;
            border-radius: 16px;
            border: 1px dashed rgba(148, 163, 184, 0.15);
            pointer-events: none;
        }

        .preview-outside-indicator {
            position: absolute;
            inset: 0;
            pointer-events: none;
            z-index: 6;
        }

        .preview-outside-indicator[hidden] {
            display: none;
        }

        .preview-outside-indicator__segment {
            position: absolute;
            display: none;
            box-sizing: border-box;
            border: 2px solid rgba(255, 255, 255, 0.9);
            border-radius: 14px;
            background: transparent;
            pointer-events: none;
        }

        .preview-outside-indicator__segment--top {
            border-radius: 14px 14px 0 0;
        }

        .preview-outside-indicator__segment--right {
            border-radius: 0 14px 14px 0;
        }

        .preview-outside-indicator__segment--bottom {
            border-radius: 0 0 14px 14px;
        }

        .preview-outside-indicator__segment--left {
            border-radius: 14px 0 0 14px;
        }

        .preview-meta {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 12px;
        }

        .preview-meta__item {
            padding: 12px 14px;
            border-radius: 12px;
            background: rgba(15, 23, 42, 0.7);
            border: 1px solid rgba(148, 163, 184, 0.18);
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .preview-meta__item span {
            font-size: 0.8rem;
            color: var(--text-secondary);
            letter-spacing: 0.04em;
        }

        .preview-meta__item strong {
            font-weight: 600;
            font-size: 0.95rem;
        }

        .preview-reference {
            margin: 4px 0 0;
            font-size: 0.82rem;
            color: rgba(203, 213, 225, 0.85);
        }

        .settings-card {
            grid-area: settings;
            display: flex;
            flex-direction: column;
            gap: 24px;
        }

        .settings-tabs {
            display: flex;
            gap: 8px;
            align-items: center;
            border-radius: 14px;
            padding: 6px;
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.18);
            overflow-x: auto;
        }

        .settings-tab {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 10px 18px;
            border-radius: 12px;
            border: none;
            background: transparent;
            color: var(--text-secondary);
            font: inherit;
            font-weight: 500;
            cursor: pointer;
            transition: color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
        }

        .settings-tab:focus-visible {
            outline: 2px solid rgba(56, 189, 248, 0.55);
            outline-offset: 2px;
        }

        .settings-tab.is-active {
            background: linear-gradient(135deg, rgba(124, 58, 237, 0.28), rgba(56, 189, 248, 0.22));
            color: var(--text-primary);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }

        .settings-content {
            display: flex;
            flex-direction: column;
            gap: 22px;
            flex: 1;
        }

        .settings-section {
            display: none;
            animation: fadeIn 0.18s ease;
        }

        .settings-section.is-active {
            display: block;
        }

        .info-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 18px;
        }

        .info-item {
            display: flex;
            gap: 16px;
            align-items: flex-start;
            padding: 16px;
            border-radius: 16px;
            background: rgba(17, 24, 39, 0.78);
            border: 1px solid rgba(148, 163, 184, 0.22);
            font-size: 0.95rem;
            color: var(--text-secondary);
            box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.08);
        }

        .info-item label {
            font-size: 0.85rem;
            letter-spacing: 0.01em;
            text-transform: uppercase;
            color: var(--text-secondary);
            display: block;
            margin-bottom: 6px;
        }

        .info-item select,
        .info-item input[type="range"] {
            width: 100%;
            padding: 10px 12px;
            border-radius: 12px;
            border: 1px solid rgba(148, 163, 184, 0.28);
            background: rgba(15, 23, 42, 0.9);
            color: var(--text-primary);
            font-size: 0.95rem;
            transition: border 0.2s ease, box-shadow 0.2s ease;
        }

        .info-item input[type="range"] {
            padding: 0;
            accent-color: rgba(124, 58, 237, 0.85);
        }

        .info-item select:focus,
        .info-item input[type="range"]:focus {
            outline: none;
            border-color: rgba(56, 189, 248, 0.6);
            box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
        }

        .info-icon {
            display: grid;
            place-items: center;
            width: 40px;
            height: 40px;
            border-radius: 14px;
            background: linear-gradient(135deg, rgba(124, 58, 237, 0.2), rgba(56, 189, 248, 0.18));
            color: rgba(244, 114, 182, 0.95);
            font-size: 20px;
        }

        .export-button {
            padding: 10px 18px;
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

        .nav-actions .export-button {
            margin: 0;
        }

        .export-dialog {
            position: fixed;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(15, 23, 42, 0.65);
            backdrop-filter: blur(18px);
            padding: clamp(16px, 4vw, 40px);
            z-index: 999;
        }

        .export-dialog[hidden] {
            display: none;
        }

        .export-dialog__panel {
            width: min(520px, 100%);
            background: rgba(11, 18, 41, 0.95);
            border-radius: 24px;
            border: 1px solid rgba(148, 163, 184, 0.22);
            box-shadow: 0 30px 80px rgba(2, 6, 23, 0.55);
            padding: clamp(24px, 4vw, 36px);
            display: flex;
            flex-direction: column;
            gap: 18px;
        }

        .export-dialog__panel h3 {
            margin: 0;
            font-size: 1.45rem;
            font-weight: 600;
        }

        .export-dialog__subtitle {
            margin: 0;
            color: var(--text-secondary);
            font-size: 0.95rem;
            line-height: 1.6;
        }

        .export-summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 12px;
        }

        .export-summary__item {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 12px 14px;
            border-radius: 14px;
            background: rgba(15, 23, 42, 0.72);
            border: 1px solid rgba(148, 163, 184, 0.16);
        }

        .export-summary__item span {
            color: var(--text-secondary);
            font-size: 0.85rem;
            letter-spacing: 0.01em;
        }

        .export-summary__item strong {
            font-size: 1.05rem;
            font-weight: 600;
        }

        .export-dialog__status {
            margin: 0;
            font-size: 0.9rem;
            color: var(--accent-2);
            display: flex;
            flex-direction: column;
            gap: 8px;
            min-height: 24px;
        }

        .export-dialog__status[data-state="warning"] {
            color: #facc15;
        }

        .export-dialog__status[data-state="progress"] {
            color: var(--text-secondary);
        }

        .export-progress {
            position: relative;
            display: block;
            width: 100%;
            height: 6px;
            border-radius: 999px;
            overflow: hidden;
            background: rgba(148, 163, 184, 0.18);
        }

        .export-progress__bar {
            position: absolute;
            top: 0;
            bottom: 0;
            left: -40%;
            width: 40%;
            border-radius: inherit;
            background: linear-gradient(90deg, var(--accent-1), var(--accent-2));
            animation: export-progress-marquee 1.4s ease-in-out infinite;
        }

        @keyframes export-progress-marquee {
            0% {
                transform: translateX(0);
            }
            100% {
                transform: translateX(250%);
            }
        }

        .export-timeline-list {
            max-height: 220px;
            overflow-y: auto;
            padding-right: 6px;
        }

        .export-timeline-list__items {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .export-timeline-list__item {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 12px 14px;
            border-radius: 14px;
            background: rgba(17, 24, 39, 0.78);
            border: 1px solid rgba(148, 163, 184, 0.18);
        }

        .export-timeline-clip-name {
            font-weight: 600;
            font-size: 0.95rem;
        }

        .export-timeline-clip-meta {
            font-size: 0.85rem;
            color: var(--text-secondary);
            letter-spacing: 0.01em;
        }

        .export-dialog__actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 4px;
        }

        .export-dialog__button {
            border: none;
            border-radius: 12px;
            padding: 12px 20px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            background: rgba(15, 23, 42, 0.8);
            color: var(--text-secondary);
            border: 1px solid rgba(148, 163, 184, 0.22);
        }

        .export-dialog__button.primary {
            background: linear-gradient(135deg, rgba(124, 58, 237, 0.95), rgba(56, 189, 248, 0.92));
            color: #0b1020;
            border: none;
            box-shadow: 0 16px 36px rgba(56, 189, 248, 0.25);
        }

        .export-dialog__button:hover {
            transform: translateY(-1px);
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
            background: rgba(8, 13, 28, 0.92);
            box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.45);
            overflow: hidden;
            transition: aspect-ratio 0.2s ease, box-shadow 0.18s ease, background 0.18s ease;
        }

        .preview-viewport.is-aligned {
            box-shadow:
                inset 0 0 0 1.5px rgba(56, 189, 248, 0.5),
                0 0 0 1px rgba(56, 189, 248, 0.22);
        }

        .preview-viewport.is-fully-aligned {
            box-shadow:
                inset 0 0 0 2px rgba(124, 58, 237, 0.65),
                0 0 0 1.5px rgba(56, 189, 248, 0.35),
                0 14px 34px rgba(8, 12, 24, 0.42);
        }

        .preview-viewport.is-aligned-left,
        .preview-viewport.is-aligned-right,
        .preview-viewport.is-aligned-top,
        .preview-viewport.is-aligned-bottom {
            background: rgba(8, 13, 28, 0.96);
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
        }

        .preview-viewport img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
        }

        .preview-image-layer {
            position: absolute;
            inset: 0;
            pointer-events: none;
        }

        .preview-image-layer[hidden] {
            display: none;
        }

        .preview-image-frame {
            position: absolute;
            top: 0;
            left: 0;
            display: flex;
            align-items: stretch;
            justify-content: stretch;
            overflow: hidden;
            box-shadow:
                0 0 0 1px rgba(148, 163, 184, 0.35),
                0 12px 32px rgba(15, 23, 42, 0.35);
            pointer-events: auto;
            cursor: grab;
            touch-action: none;
            transition: box-shadow 0.18s ease;
        }

        .preview-image-frame.is-dragging,
        .preview-image-frame.is-resizing {
            cursor: grabbing;
            box-shadow:
                0 0 0 1px rgba(56, 189, 248, 0.65),
                0 18px 38px rgba(8, 12, 24, 0.45);
        }

        .preview-image-frame img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            user-select: none;
            pointer-events: none;
        }

        .preview-resize-handle {
            position: absolute;
            width: 18px;
            height: 18px;
            border-radius: 8px;
            border: 1px solid rgba(148, 163, 184, 0.35);
            background: linear-gradient(135deg, rgba(124, 58, 237, 0.9), rgba(56, 189, 248, 0.9));
            box-shadow:
                0 0 0 2px rgba(15, 23, 42, 0.85),
                0 10px 20px rgba(14, 21, 37, 0.45);
            cursor: pointer;
            pointer-events: auto;
            padding: 0;
        }

        .preview-resize-handle:focus-visible {
            outline: 2px solid rgba(56, 189, 248, 0.85);
            outline-offset: 3px;
        }

        .preview-resize-handle.handle-nw {
            top: -9px;
            left: -9px;
            cursor: nwse-resize;
        }

        .preview-resize-handle.handle-ne {
            top: -9px;
            right: -9px;
            cursor: nesw-resize;
        }

        .preview-resize-handle.handle-se {
            bottom: -9px;
            right: -9px;
            cursor: nwse-resize;
        }

        .preview-resize-handle.handle-sw {
            bottom: -9px;
            left: -9px;
            cursor: nesw-resize;
        }

        .preview-guides-layer {
            position: absolute;
            inset: 0;
            pointer-events: none;
            z-index: 12;
            display: none;
        }

        .preview-guides-layer.is-active {
            display: block;
        }

        .preview-guide {
            position: absolute;
            display: none;
            opacity: 0.95;
            pointer-events: none;
            transition: opacity 0.12s ease;
        }

        .preview-guide--vertical {
            top: 0;
            bottom: 0;
            width: 2px;
            transform: translateX(-50%);
        }

        .preview-guide--horizontal {
            left: 0;
            right: 0;
            height: 2px;
            transform: translateY(-50%);
        }

        .preview-guide--alignment {
            background: linear-gradient(180deg, rgba(56, 189, 248, 0.85), rgba(124, 58, 237, 0.65));
            box-shadow:
                0 0 0 1px rgba(148, 163, 184, 0.35),
                0 0 18px rgba(56, 189, 248, 0.35);
        }

        .preview-guide--snap {
            background: linear-gradient(180deg, rgba(244, 114, 182, 0.9), rgba(56, 189, 248, 0.75));
            box-shadow:
                0 0 0 1px rgba(15, 23, 42, 0.6),
                0 0 12px rgba(244, 114, 182, 0.4);
        }

        .preview-guide--smart {
            width: 120px;
            height: 120px;
            border-radius: 18px;
            border: 1.5px dashed rgba(124, 58, 237, 0.65);
            transform: translate(-50%, -50%);
            display: none;
            box-shadow:
                0 0 0 1px rgba(15, 23, 42, 0.6),
                0 0 20px rgba(124, 58, 237, 0.3);
        }

        .preview-guide--smart::before,
        .preview-guide--smart::after {
            content: '';
            position: absolute;
            left: 50%;
            top: 0;
            bottom: 0;
            width: 1.5px;
            transform: translateX(-50%);
            background: linear-gradient(180deg, rgba(56, 189, 248, 0.8), rgba(124, 58, 237, 0.6));
        }

        .preview-guide--smart::after {
            top: 50%;
            bottom: auto;
            height: 1.5px;
            width: 100%;
            left: 0;
            transform: translateY(-50%);
            background: linear-gradient(90deg, rgba(56, 189, 248, 0.8), rgba(124, 58, 237, 0.6));
        }

        .preview-guide--smart[data-state="locked"] {
            border-color: rgba(244, 114, 182, 0.85);
            box-shadow:
                0 0 0 1px rgba(244, 114, 182, 0.7),
                0 0 24px rgba(244, 114, 182, 0.4);
        }

        .preview-guide-measure {
            position: absolute;
            display: none;
            padding: 6px 10px;
            border-radius: 999px;
            font-size: 0.72rem;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            background: rgba(8, 13, 28, 0.85);
            color: rgba(226, 232, 240, 0.95);
            box-shadow: 0 12px 32px rgba(8, 12, 24, 0.45);
            white-space: nowrap;
        }

        .preview-guide-measure[data-measure="size"] {
            transform: translate(-50%, -50%);
        }

        .preview-guide-measure[data-measure="position"] {
            transform: translate(-50%, -100%);
        }

        .preview-guide-measure[data-placement="below"] {
            transform: translate(-50%, 0);
        }

        .preview-ruler {
            position: absolute;
            display: none;
            font-size: 0.68rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: rgba(226, 232, 240, 0.92);
            pointer-events: none;
            mix-blend-mode: screen;
        }

        .preview-ruler.is-visible {
            display: block;
        }

        .preview-ruler--horizontal {
            left: 0;
            right: 0;
            top: 0;
            height: 28px;
            padding: 8px 10px 6px;
            background:
                linear-gradient(180deg, rgba(15, 23, 42, 0.9), rgba(15, 23, 42, 0)) 0 0 / 100% 100%,
                repeating-linear-gradient(90deg, rgba(148, 163, 184, 0.28), rgba(148, 163, 184, 0.28) 1px, transparent 1px, transparent 8px);
            border-bottom: 1px solid rgba(148, 163, 184, 0.22);
        }

        .preview-ruler--horizontal::after {
            content: '';
            position: absolute;
            left: var(--marker-start, 0px);
            right: calc(100% - var(--marker-end, 0px));
            top: 0;
            bottom: 6px;
            border-bottom: 2px solid rgba(56, 189, 248, 0.9);
            background: linear-gradient(180deg, rgba(56, 189, 248, 0.22), rgba(124, 58, 237, 0.2));
            pointer-events: none;
        }

        .preview-ruler--vertical {
            top: 0;
            bottom: 0;
            left: 0;
            width: 28px;
            padding: 10px 6px;
            background:
                linear-gradient(90deg, rgba(15, 23, 42, 0.9), rgba(15, 23, 42, 0)) 0 0 / 100% 100%,
                repeating-linear-gradient(0deg, rgba(148, 163, 184, 0.28), rgba(148, 163, 184, 0.28) 1px, transparent 1px, transparent 8px);
            border-right: 1px solid rgba(148, 163, 184, 0.22);
        }

        .preview-ruler--vertical::after {
            content: '';
            position: absolute;
            top: var(--marker-start, 0px);
            bottom: calc(100% - var(--marker-end, 0px));
            left: 0;
            right: 6px;
            border-right: 2px solid rgba(56, 189, 248, 0.9);
            background: linear-gradient(90deg, rgba(56, 189, 248, 0.22), rgba(124, 58, 237, 0.2));
            pointer-events: none;
        }

        .preview-ruler__label {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 3px 8px;
            border-radius: 999px;
            background: rgba(8, 13, 28, 0.85);
            box-shadow: 0 10px 24px rgba(8, 12, 24, 0.45);
        }

        .preview-ruler--vertical .preview-ruler__label {
            writing-mode: vertical-rl;
            transform: rotate(180deg);
            gap: 4px;
        }

        .timeline-card {
            position: relative;
            overflow: hidden;
        }

        .timeline-track {
            position: relative;
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 16px;
            border-radius: 14px;
            background: rgba(8, 12, 24, 0.75);
            border: 1px dashed rgba(148, 163, 184, 0.24);
            color: var(--text-secondary);
            font-size: 0.95rem;
            min-height: 180px;
            overflow: auto;
            scrollbar-width: thin;
        }

        .timeline-empty-state-button {
            align-self: center;
            padding: 12px 20px;
            border-radius: 999px;
            border: 1px dashed rgba(148, 163, 184, 0.3);
            background: rgba(15, 23, 42, 0.55);
            color: var(--text-secondary);
            font-size: 0.95rem;
            font-weight: 500;
            cursor: pointer;
            transition: border-color 0.2s ease, transform 0.2s ease, background 0.2s ease;
        }

        .timeline-empty-state-button:hover,
        .timeline-empty-state-button:focus-visible {
            border-color: rgba(124, 58, 237, 0.55);
            background: rgba(30, 41, 59, 0.65);
            transform: translateY(-1px);
            outline: none;
        }

        .timeline-empty-state-button:focus-visible {
            box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.3);
        }

        .timeline-lane-list {
            position: relative;
            display: inline-flex;
            flex-direction: column;
            gap: 12px;
            min-width: 100%;
            z-index: 2;
        }

        .timeline-lane {
            position: relative;
            display: inline-flex;
            flex-direction: row;
            flex-wrap: nowrap;
            align-items: stretch;
            gap: 10px;
            padding: 12px;
            border-radius: 12px;
            background: rgba(15, 23, 42, 0.6);
            border: 1px dashed rgba(148, 163, 184, 0.22);
            min-height: 110px;
            min-width: 100%;
            width: max-content;
            transition: border-color 0.2s ease, background 0.2s ease;
        }

        .timeline-lane.is-drop-target {
            border-color: rgba(124, 58, 237, 0.55);
            background: rgba(30, 41, 59, 0.6);
        }

        .timeline-track.timeline-track--empty .timeline-lane {
            opacity: 0.65;
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

        .timeline-item:focus {
            outline: 3px solid rgba(124, 58, 237, 0.8);
            outline-offset: 2px;
        }

        .timeline-item-remove {
            position: absolute;
            top: 6px;
            right: 6px;
            width: 24px;
            height: 24px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: none;
            border-radius: 999px;
            background: rgba(15, 23, 42, 0.68);
            color: rgba(226, 232, 240, 0.85);
            font-size: 0.75rem;
            line-height: 1;
            cursor: pointer;
            opacity: 0.75;
            transition: opacity 0.2s ease, background 0.2s ease, color 0.2s ease;
        }

        .timeline-item-remove:hover,
        .timeline-item-remove:focus-visible {
            opacity: 1;
            background: rgba(30, 41, 59, 0.9);
            color: rgba(248, 250, 252, 0.95);
        }

        .timeline-item-remove:focus-visible {
            outline: 2px solid rgba(124, 58, 237, 0.7);
            outline-offset: 2px;
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
            position: absolute;
            inset: 0;
            display: grid;
            place-items: center;
            margin: 0;
            padding: 0 24px;
            text-align: center;
            pointer-events: none;
            z-index: 4;
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
            z-index: 3;
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
                grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.3fr);
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
                    <button type="button" class="export-button">Export video</button>
                    <a class="primary" href="{{ url_for('signout') }}">Sign Out</a>
                {% else %}
                    <a href="{{ url_for('login') }}">Log In</a>
                    <a class="primary" href="{{ url_for('signup') }}">Get Started</a>
                    <button type="button" class="export-button">Export video</button>
                {% endif %}
            </nav>
        </header>

        <section id="features" class="editor-layout">
            <article class="panel upload-card">
                <div class="panel-header">
                    <h2>Upload footage</h2>
                    <p class="panel-subtitle">Bring in your raw clips with a guided dropzone that supports bulk uploads.</p>
                </div>
                <label class="upload-dropzone" for="video-upload">
                    <div class="upload-dropzone__icon" aria-hidden="true">⬆️</div>
                    <div class="upload-dropzone__text">
                        <strong>Drag &amp; drop footage</strong>
                        <span>or tap to browse from your device</span>
                    </div>
                    <input type="file" id="video-upload" name="video-upload" accept="video/*,image/*" multiple class="visually-hidden">
                </label>
                <div class="upload-meta" aria-live="polite">
                    <span class="upload-meta__status">No clips added yet</span>
                    <span class="upload-meta__hint">Tip: drop multiple files to keep your story flowing.</span>
                </div>
                <div class="upload-actions">
                    <button type="button" id="upload-button" class="upload-primary">Choose files</button>
                    <button type="button" class="upload-secondary" disabled>Import from cloud</button>
                </div>
                <ul class="upload-guidelines">
                    <li>Supports MP4, MOV, AVI, GIF and PNG formats.</li>
                    <li>For best results upload footage in 1080p or higher.</li>
                </ul>
            </article>

            <article class="panel preview-card">
                <div class="panel-header preview-header">
                    <div>
                        <h2>Preview window</h2>
                        <p class="panel-subtitle">Review scenes in a responsive canvas with live aspect toggles.</p>
                    </div>
                    <div class="preview-toolbar">
                        <label for="preview-aspect">Aspect ratio</label>
                        <select id="preview-aspect">
                            <option value="16:9" selected>16:9 (Landscape)</option>
                            <option value="9:16">9:16 (Portrait)</option>
                        </select>
                    </div>
                </div>
                <div class="preview-area">
                    <div class="preview-viewport">
                        <span id="preview-placeholder">Drop clips here to preview your edit</span>
                        <video id="preview-video" controls hidden preload="auto" playsinline></video>
                        <div class="preview-image-layer" id="preview-image-layer" hidden>
                            <div class="preview-image-frame" id="preview-image-frame" role="presentation">
                                <img id="preview-image" alt="Preview" hidden>
                                <button type="button" class="preview-resize-handle handle-nw" data-handle="nw" aria-label="Resize from top left"></button>
                                <button type="button" class="preview-resize-handle handle-ne" data-handle="ne" aria-label="Resize from top right"></button>
                                <button type="button" class="preview-resize-handle handle-se" data-handle="se" aria-label="Resize from bottom right"></button>
                                <button type="button" class="preview-resize-handle handle-sw" data-handle="sw" aria-label="Resize from bottom left"></button>
                            </div>
                        </div>
                        <div class="preview-guides-layer" id="preview-guides-layer" hidden aria-hidden="true">
                            <div class="preview-ruler preview-ruler--horizontal" data-ruler="horizontal">
                                <span class="preview-ruler__label" data-ruler-value="horizontal"></span>
                            </div>
                            <div class="preview-ruler preview-ruler--vertical" data-ruler="vertical">
                                <span class="preview-ruler__label" data-ruler-value="vertical"></span>
                            </div>
                            <div class="preview-guide preview-guide--alignment preview-guide--vertical" data-guide="align-left"></div>
                            <div class="preview-guide preview-guide--alignment preview-guide--vertical" data-guide="align-right"></div>
                            <div class="preview-guide preview-guide--alignment preview-guide--horizontal" data-guide="align-top"></div>
                            <div class="preview-guide preview-guide--alignment preview-guide--horizontal" data-guide="align-bottom"></div>
                            <div class="preview-guide preview-guide--alignment preview-guide--vertical" data-guide="align-center-vertical"></div>
                            <div class="preview-guide preview-guide--alignment preview-guide--horizontal" data-guide="align-center-horizontal"></div>
                            <div class="preview-guide preview-guide--snap preview-guide--vertical" data-guide="snap-left"></div>
                            <div class="preview-guide preview-guide--snap preview-guide--vertical" data-guide="snap-right"></div>
                            <div class="preview-guide preview-guide--snap preview-guide--horizontal" data-guide="snap-top"></div>
                            <div class="preview-guide preview-guide--snap preview-guide--horizontal" data-guide="snap-bottom"></div>
                            <div class="preview-guide preview-guide--smart" data-guide="smart-center"></div>
                            <div class="preview-guide-measure" data-measure="size"></div>
                            <div class="preview-guide-measure" data-measure="position"></div>
                        </div>
                    </div>
                </div>
                <div class="preview-outside-indicator" id="preview-outside-indicator" hidden aria-hidden="true">
                    <div class="preview-outside-indicator__segment preview-outside-indicator__segment--top" data-segment="top"></div>
                    <div class="preview-outside-indicator__segment preview-outside-indicator__segment--right" data-segment="right"></div>
                    <div class="preview-outside-indicator__segment preview-outside-indicator__segment--bottom" data-segment="bottom"></div>
                    <div class="preview-outside-indicator__segment preview-outside-indicator__segment--left" data-segment="left"></div>
                </div>
                <div class="preview-meta">
                    <div class="preview-meta__item">
                        <span>Aspect</span>
                        <strong id="preview-aspect-label">16:9 (Landscape)</strong>
                    </div>
                    <div class="preview-meta__item">
                        <span>Safe guides</span>
                        <strong>On</strong>
                    </div>
                </div>
                <p class="preview-reference">The Ultimate Guide to Social Media Graphic Sizes and Dimensions</p>
            </article>

            <article class="panel settings-card">
                <div class="panel-header">
                    <h2>Creative controls</h2>
                    <p class="panel-subtitle">Dial in the look, pacing and sound with tactile sliders and curated presets.</p>
                </div>
                <div class="settings-tabs" role="tablist" aria-label="Sidebar controls">
                    <button type="button" class="settings-tab is-active" id="settings-tab-video" role="tab" aria-selected="true" aria-controls="settings-video" data-section="video">Video</button>
                    <button type="button" class="settings-tab" id="settings-tab-animation" role="tab" aria-selected="false" aria-controls="settings-animation" data-section="animation">Animation</button>
                    <button type="button" class="settings-tab" id="settings-tab-speed" role="tab" aria-selected="false" aria-controls="settings-speed" data-section="speed">Speed</button>
                    <button type="button" class="settings-tab" id="settings-tab-audio" role="tab" aria-selected="false" aria-controls="settings-audio" data-section="audio">Audio</button>
                    <button type="button" class="settings-tab" id="settings-tab-adjustment" role="tab" aria-selected="false" aria-controls="settings-adjustment" data-section="adjustment">Adjustment</button>
                </div>
                <div class="settings-content">
                    <section class="settings-section is-active" id="settings-video" data-section="video" role="tabpanel" aria-labelledby="settings-tab-video">
                        <div class="info-list">
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
                            <div class="info-item">
                                <div class="info-icon">🎨</div>
                                <div>
                                    <label for="video-color-profile">Color profile</label>
                                    <select id="video-color-profile">
                                        <option value="standard" selected>Standard</option>
                                        <option value="cinematic">Cinematic</option>
                                        <option value="hdr">HDR vivid</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </section>
                    <section class="settings-section" id="settings-animation" data-section="animation" role="tabpanel" aria-labelledby="settings-tab-animation" hidden>
                        <div class="info-list">
                            <div class="info-item">
                                <div class="info-icon">✨</div>
                                <div>
                                    <label for="animation-preset">Transition preset</label>
                                    <select id="animation-preset">
                                        <option value="cut" selected>Quick cut</option>
                                        <option value="fade">Soft fade</option>
                                        <option value="zoom">Dynamic zoom</option>
                                    </select>
                                </div>
                            </div>
                            <div class="info-item">
                                <div class="info-icon">🌀</div>
                                <div>
                                    <label for="animation-intensity">Motion intensity</label>
                                    <input type="range" id="animation-intensity" min="0" max="100" value="45">
                                </div>
                            </div>
                        </div>
                    </section>
                    <section class="settings-section" id="settings-speed" data-section="speed" role="tabpanel" aria-labelledby="settings-tab-speed" hidden>
                        <div class="info-list">
                            <div class="info-item">
                                <div class="info-icon">⏱️</div>
                                <div>
                                    <label for="video-speed">Playback speed</label>
                                    <select id="video-speed">
                                        <option value="0.25">0.25x</option>
                                        <option value="0.5">0.5x</option>
                                        <option value="1" selected>1x (default)</option>
                                        <option value="1.5">1.5x</option>
                                        <option value="2">2x</option>
                                        <option value="3">3x</option>
                                    </select>
                                </div>
                            </div>
                            <div class="info-item">
                                <div class="info-icon">🎬</div>
                                <div>
                                    <label for="speed-ramp">Speed ramping</label>
                                    <select id="speed-ramp">
                                        <option value="none" selected>None</option>
                                        <option value="ease-in">Ease in</option>
                                        <option value="ease-out">Ease out</option>
                                        <option value="ease-in-out">Ease in-out</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </section>
                    <section class="settings-section" id="settings-audio" data-section="audio" role="tabpanel" aria-labelledby="settings-tab-audio" hidden>
                        <div class="info-list">
                            <div class="info-item">
                                <div class="info-icon">🔊</div>
                                <div>
                                    <label for="video-volume">Master volume</label>
                                    <input type="range" id="video-volume" min="0" max="100" value="80">
                                </div>
                            </div>
                            <div class="info-item">
                                <div class="info-icon">🎵</div>
                                <div>
                                    <label for="audio-track">Audio track</label>
                                    <select id="audio-track">
                                        <option value="original" selected>Original track</option>
                                        <option value="voice">Voice enhancement</option>
                                        <option value="music">Music bed</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </section>
                    <section class="settings-section" id="settings-adjustment" data-section="adjustment" role="tabpanel" aria-labelledby="settings-tab-adjustment" hidden>
                        <div class="info-list">
                            <div class="info-item">
                                <div class="info-icon">🌗</div>
                                <div>
                                    <label for="adjustment-exposure">Exposure</label>
                                    <input type="range" id="adjustment-exposure" min="-50" max="50" value="0">
                                </div>
                            </div>
                            <div class="info-item">
                                <div class="info-icon">🎚️</div>
                                <div>
                                    <label for="adjustment-contrast">Contrast</label>
                                    <input type="range" id="adjustment-contrast" min="-50" max="50" value="10">
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </article>
        </section>

        <section class="panel timeline-card timeline-footer">
            <h2>Timeline overview</h2>
            <div class="timeline-track" id="timeline-track">
                <div class="timeline-progress-line" id="timeline-progress-line" aria-hidden="true"></div>
                <div class="timeline-lane-list" id="timeline-lane-list" role="list">
                    <div class="timeline-lane" data-lane-index="0"></div>
                </div>
                <button type="button" id="timeline-empty-state" class="timeline-empty-state-button">
                    Upload media to build your timeline
                </button>
            </div>
            <div class="timeline-progress">
                <label for="timeline-progress">Progress</label>
                <input type="range" id="timeline-progress" min="0" max="100" value="0">
                <span class="playback-time" id="playback-time" aria-live="polite">00:00 / 00:00</span>
                <button type="button" id="play-video-button">Play Back</button>
            </div>
        </section>

        <div class="export-dialog" id="export-dialog" hidden aria-hidden="true">
            <div class="export-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title">
                <h3 id="export-dialog-title">Export timeline to MP4</h3>
                <p class="export-dialog__subtitle">We gathered the latest playback from your timeline. Review the export configuration before confirming.</p>
                <div class="export-summary">
                    <div class="export-summary__item">
                        <span>Total clips</span>
                        <strong id="export-summary-clips">0</strong>
                    </div>
                    <div class="export-summary__item">
                        <span>Total duration</span>
                        <strong id="export-summary-duration">00:00</strong>
                    </div>
                    <div class="export-summary__item">
                        <span>Resolution</span>
                        <strong id="export-summary-resolution">720p HD</strong>
                    </div>
                    <div class="export-summary__item">
                        <span>Format</span>
                        <strong id="export-summary-format">MP4 (H.264)</strong>
                    </div>
                </div>
                <p class="export-dialog__status" id="export-dialog-status" data-state="ready" aria-live="polite">Preview completed successfully. Ready to export.</p>
                <div class="export-timeline-list" id="export-timeline-list"></div>
                <div class="export-dialog__actions">
                    <button type="button" class="export-dialog__button" id="cancel-export-button">Cancel</button>
                    <button type="button" class="export-dialog__button primary" id="confirm-export-button">Confirm export</button>
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
        const uploadMetaStatus = document.querySelector('.upload-meta__status');
        const uploadMetaHint = document.querySelector('.upload-meta__hint');
        const previewArea = document.querySelector('.preview-area');
        const previewViewport = document.querySelector('.preview-viewport');
        const previewVideo = document.getElementById('preview-video');
        const previewImage = document.getElementById('preview-image');
        const previewImageLayer = document.getElementById('preview-image-layer');
        const previewImageFrame = document.getElementById('preview-image-frame');
        const previewResizeHandles = previewImageFrame
            ? Array.from(previewImageFrame.querySelectorAll('.preview-resize-handle'))
            : [];
        const previewCard = document.querySelector('.preview-card');
        const previewOutsideIndicator = document.getElementById('preview-outside-indicator');
        const previewOutsideSegments = previewOutsideIndicator
            ? {
                top: previewOutsideIndicator.querySelector('[data-segment="top"]'),
                right: previewOutsideIndicator.querySelector('[data-segment="right"]'),
                bottom: previewOutsideIndicator.querySelector('[data-segment="bottom"]'),
                left: previewOutsideIndicator.querySelector('[data-segment="left"]'),
            }
            : null;
        const previewGuidesLayer = document.getElementById('preview-guides-layer');
        const previewGuideElements = previewGuidesLayer
            ? {
                alignLeft: previewGuidesLayer.querySelector('[data-guide="align-left"]'),
                alignRight: previewGuidesLayer.querySelector('[data-guide="align-right"]'),
                alignTop: previewGuidesLayer.querySelector('[data-guide="align-top"]'),
                alignBottom: previewGuidesLayer.querySelector('[data-guide="align-bottom"]'),
                alignCenterVertical: previewGuidesLayer.querySelector('[data-guide="align-center-vertical"]'),
                alignCenterHorizontal: previewGuidesLayer.querySelector('[data-guide="align-center-horizontal"]'),
                snapLeft: previewGuidesLayer.querySelector('[data-guide="snap-left"]'),
                snapRight: previewGuidesLayer.querySelector('[data-guide="snap-right"]'),
                snapTop: previewGuidesLayer.querySelector('[data-guide="snap-top"]'),
                snapBottom: previewGuidesLayer.querySelector('[data-guide="snap-bottom"]'),
                smartCenter: previewGuidesLayer.querySelector('[data-guide="smart-center"]'),
            }
            : null;
        const previewGuideMeasurements = previewGuidesLayer
            ? {
                size: previewGuidesLayer.querySelector('[data-measure="size"]'),
                position: previewGuidesLayer.querySelector('[data-measure="position"]'),
            }
            : null;
        const previewRulerElements = previewGuidesLayer
            ? {
                horizontal: previewGuidesLayer.querySelector('[data-ruler="horizontal"]'),
                vertical: previewGuidesLayer.querySelector('[data-ruler="vertical"]'),
                horizontalLabel: previewGuidesLayer.querySelector('[data-ruler-value="horizontal"]'),
                verticalLabel: previewGuidesLayer.querySelector('[data-ruler-value="vertical"]'),
            }
            : null;
        const previewPlaceholder = document.getElementById('preview-placeholder');
        const timelineTrack = document.getElementById('timeline-track');
        const timelineLaneList = document.getElementById('timeline-lane-list');
        const timelineEmptyState = document.getElementById('timeline-empty-state');
        const playVideoButton = document.getElementById('play-video-button');
        const timelineProgressLine = document.getElementById('timeline-progress-line');
        const timelineProgressInput = document.getElementById('timeline-progress');
        if (timelineProgressInput) {
            timelineProgressInput.addEventListener('input', () => {
                stopTimelinePlayback(true, false);
                const rawValue = Number(timelineProgressInput.value);
                const fraction = Number.isFinite(rawValue) ? rawValue / 100 : 0;
                seekTimelineToFraction(fraction);
            });
        }
        const previewAspectSelect = document.getElementById('preview-aspect');
        const previewAspectLabel = document.getElementById('preview-aspect-label');
        const playbackTimeDisplay = document.getElementById('playback-time');
        const exportButton = document.querySelector('.export-button');
        const exportDialog = document.getElementById('export-dialog');
        const exportTimelineList = document.getElementById('export-timeline-list');
        const exportSummaryClips = document.getElementById('export-summary-clips');
        const exportSummaryDuration = document.getElementById('export-summary-duration');
        const exportSummaryResolution = document.getElementById('export-summary-resolution');
        const exportSummaryFormat = document.getElementById('export-summary-format');
        const exportDialogStatus = document.getElementById('export-dialog-status');
        const confirmExportButton = document.getElementById('confirm-export-button');
        const cancelExportButton = document.getElementById('cancel-export-button');
        const videoQualitySelect = document.getElementById('video-quality');
        const settingsTabs = Array.from(document.querySelectorAll('.settings-tab'));
        const settingsSections = Array.from(document.querySelectorAll('.settings-section'));
        const exportMirrorCanvas = document.createElement('canvas');
        const exportMirrorContext = exportMirrorCanvas.getContext('2d');
        let activeTimelineItem = null;
        let isTimelinePlaying = false;
        let timelinePlaybackAbort = null;
        let currentPreviewAspectRatio = 16 / 9;
        let previewViewportResizeFrame = null;
        let timelineIndicatorResizeFrame = null;
        let previewAreaResizeObserver = null;
        let timelineTrackResizeObserver = null;
        let activeDropLane = null;
        let isExportingTimeline = false;
        let previewImageTransform = null;
        let pendingPreviewImageTransform = null;
        let lastPreviewViewportSize = null;
        let shouldResetImageFrameOnNextViewportUpdate = false;
        let previewGuidesHideTimeout = null;

        const MEDIA_READY_STATE_ENOUGH = typeof HTMLMediaElement !== 'undefined'
            && typeof HTMLMediaElement.HAVE_ENOUGH_DATA === 'number'
                ? HTMLMediaElement.HAVE_ENOUGH_DATA
                : 4;
        const MEDIA_READY_EVENTS = ['canplaythrough', 'canplay', 'loadeddata'];

        function waitForMediaReady(mediaElement, options = {}) {
            const { signal } = options;

            return new Promise((resolve, reject) => {
                if (!mediaElement) {
                    resolve();
                    return;
                }

                if (mediaElement.readyState >= MEDIA_READY_STATE_ENOUGH) {
                    resolve();
                    return;
                }

                let settled = false;

                const finish = (callback) => (value) => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    cleanup();
                    callback(value);
                };

                const handleReady = finish(() => resolve());
                const handleError = finish((event) => {
                    const error = event?.error || new Error('Unable to buffer media for preview.');
                    reject(error);
                });
                const handleAbort = finish(() => {
                    const abortError = typeof DOMException === 'function'
                        ? new DOMException('Playback aborted', 'AbortError')
                        : new Error('Playback aborted');
                    reject(abortError);
                });

                function cleanup() {
                    MEDIA_READY_EVENTS.forEach((eventName) => {
                        mediaElement.removeEventListener(eventName, handleReady);
                    });
                    mediaElement.removeEventListener('error', handleError);
                    if (signal) {
                        signal.removeEventListener('abort', handleAbort);
                    }
                }

                MEDIA_READY_EVENTS.forEach((eventName) => {
                    mediaElement.addEventListener(eventName, handleReady);
                });
                mediaElement.addEventListener('error', handleError);

                if (signal) {
                    if (signal.aborted) {
                        handleAbort();
                        return;
                    }
                    signal.addEventListener('abort', handleAbort);
                }
            });
        }

        const previewImagePointerState = {
            pointerId: null,
            mode: null,
            handle: null,
            origin: null,
        };

        const PREVIEW_IMAGE_SNAP_THRESHOLD = 12;
        const PREVIEW_ALIGNMENT_TOLERANCE = 0.75;
        const PREVIEW_GUIDE_NEAR_THRESHOLD = Math.max(PREVIEW_IMAGE_SNAP_THRESHOLD, 14);
        const PREVIEW_SMART_GUIDE_TOLERANCE = 6;
        const PREVIEW_ALIGNMENT_CLASSES = {
            left: 'is-aligned-left',
            right: 'is-aligned-right',
            top: 'is-aligned-top',
            bottom: 'is-aligned-bottom',
        };

        let previewViewportAlignmentState = {
            left: false,
            right: false,
            top: false,
            bottom: false,
        };

        const IMAGE_FRAME_DURATION = 1000;
        const DEFAULT_VIDEO_DURATION = 3000;
        const MIN_IMAGE_DURATION = 400;
        const TIMELINE_DURATION_PER_PIXEL = 12;
        const MIN_TIMELINE_ITEM_WIDTH = 96;
        const MIN_IMAGE_FRAME_SIZE = 96;
        const TIMELINE_AUTO_EXTEND_THRESHOLD = 96;
        const TIMELINE_AUTO_EXTEND_STEP = 240;
        const MAX_TIMELINE_LANES = 4;

        let playbackClockAnimationFrame = null;
        let playbackClockStartTimestamp = 0;
        let playbackClockBaseElapsed = 0;
        let playbackClockTotalDuration = 0;
        let playbackDisplayCurrentMs = 0;
        let playbackDisplayTotalMs = 0;
        let timelineAutoExtendFrame = null;

        function activateSettingsSection(sectionName) {
            if (!settingsTabs.length || !settingsSections.length) {
                return;
            }

            const fallbackSection = settingsSections[0]?.dataset.section || '';
            const targetSection = sectionName || fallbackSection;
            let matched = false;

            settingsTabs.forEach((tab) => {
                const isMatch = tab.dataset.section === targetSection;
                tab.classList.toggle('is-active', isMatch);
                tab.setAttribute('aria-selected', String(isMatch));
                tab.tabIndex = isMatch ? 0 : -1;
                if (isMatch) {
                    matched = true;
                }
            });

            const resolvedSection = matched ? targetSection : fallbackSection;

            settingsSections.forEach((section) => {
                const isActive = section.dataset.section === resolvedSection;
                section.classList.toggle('is-active', isActive);
                section.setAttribute('aria-hidden', String(!isActive));
                if (isActive) {
                    section.removeAttribute('hidden');
                } else {
                    section.setAttribute('hidden', '');
                }
            });

            if (!matched && resolvedSection !== targetSection) {
                settingsTabs.forEach((tab) => {
                    const isFallback = tab.dataset.section === resolvedSection;
                    tab.classList.toggle('is-active', isFallback);
                    tab.setAttribute('aria-selected', String(isFallback));
                    tab.tabIndex = isFallback ? 0 : -1;
                });
            }
        }

        settingsTabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                activateSettingsSection(tab.dataset.section);
            });
        });

        activateSettingsSection(settingsTabs.find((tab) => tab.classList.contains('is-active'))?.dataset.section);

        function formatTime(milliseconds) {
            const safeMs = Math.max(0, Math.floor(Number(milliseconds) || 0));
            const totalSeconds = Math.floor(safeMs / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        const EXPORT_RESOLUTION_PRESETS = {
            '16:9': {
                '480p': { width: 854, height: 480 },
                '720p': { width: 1280, height: 720 },
                '1080p': { width: 1920, height: 1080 },
            },
            '9:16': {
                '480p': { width: 480, height: 854 },
                '720p': { width: 720, height: 1280 },
                '1080p': { width: 1080, height: 1920 },
            },
        };

        function getExportResolution(aspectValue, qualityValue) {
            const aspectKey = (aspectValue || '16:9') in EXPORT_RESOLUTION_PRESETS
                ? aspectValue
                : '16:9';
            const presetsForAspect = EXPORT_RESOLUTION_PRESETS[aspectKey] || {};
            const qualityKey = qualityValue && qualityValue in presetsForAspect
                ? qualityValue
                : '720p';
            return presetsForAspect[qualityKey];
        }

        const EXPORT_FORMAT_CANDIDATES = [
            {
                mimeType: 'video/mp4;codecs="avc1.42E01E, mp4a.40.2"',
                fileExtension: 'mp4',
                label: 'MP4 (H.264)',
            },
            {
                mimeType: 'video/mp4;codecs="avc1.4D401E, mp4a.40.2"',
                fileExtension: 'mp4',
                label: 'MP4 (H.264)',
            },
            {
                mimeType: 'video/mp4',
                fileExtension: 'mp4',
                label: 'MP4 (H.264)',
            },
            {
                mimeType: 'video/webm;codecs="vp9,opus"',
                fileExtension: 'webm',
                label: 'WebM (VP9)',
            },
            {
                mimeType: 'video/webm;codecs="vp8,opus"',
                fileExtension: 'webm',
                label: 'WebM (VP8)',
            },
            {
                mimeType: 'video/webm',
                fileExtension: 'webm',
                label: 'WebM',
            },
        ];

        function getSupportedExportFormat() {
            if (!window.MediaRecorder) {
                return null;
            }
            for (const candidate of EXPORT_FORMAT_CANDIDATES) {
                try {
                    if (window.MediaRecorder.isTypeSupported(candidate.mimeType)) {
                        return candidate;
                    }
                } catch (error) {
                    // Continue to next candidate
                }
            }
            return null;
        }

        function computeContainDimensions(sourceWidth, sourceHeight, targetWidth, targetHeight) {
            if (!Number.isFinite(sourceWidth)
                || !Number.isFinite(sourceHeight)
                || sourceWidth <= 0
                || sourceHeight <= 0
            ) {
                return {
                    x: 0,
                    y: 0,
                    width: targetWidth,
                    height: targetHeight,
                };
            }

            const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
            const width = sourceWidth * scale;
            const height = sourceHeight * scale;
            const x = (targetWidth - width) / 2;
            const y = (targetHeight - height) / 2;
            return { x, y, width, height };
        }

        let previewImageFrameBorderRadius = null;

        function getPreviewImageFrameBorderRadius() {
            if (previewImageFrameBorderRadius !== null) {
                return previewImageFrameBorderRadius;
            }
            if (!previewImageFrame || !window.getComputedStyle) {
                previewImageFrameBorderRadius = 0;
                return previewImageFrameBorderRadius;
            }
            const computed = window.getComputedStyle(previewImageFrame).borderRadius || '';
            const parsed = parseFloat(computed);
            previewImageFrameBorderRadius = Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
            return previewImageFrameBorderRadius;
        }

        function clipRoundRectPath(context, x, y, width, height, radius) {
            if (!context) {
                return;
            }
            const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
            context.beginPath();
            if (typeof context.roundRect === 'function') {
                context.roundRect(x, y, width, height, safeRadius);
                return;
            }
            const r = safeRadius;
            if (r === 0) {
                context.rect(x, y, width, height);
                return;
            }
            context.moveTo(x + r, y);
            context.lineTo(x + width - r, y);
            context.quadraticCurveTo(x + width, y, x + width, y + r);
            context.lineTo(x + width, y + height - r);
            context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
            context.lineTo(x + r, y + height);
            context.quadraticCurveTo(x, y + height, x, y + height - r);
            context.lineTo(x, y + r);
            context.quadraticCurveTo(x, y, x + r, y);
        }

        function getActivePreviewImageTransform(viewportWidth, viewportHeight) {
            if (previewImageTransform
                && Number.isFinite(previewImageTransform.left)
                && Number.isFinite(previewImageTransform.top)
                && Number.isFinite(previewImageTransform.width)
                && Number.isFinite(previewImageTransform.height)
            ) {
                return previewImageTransform;
            }

            if (!activeTimelineItem) {
                return null;
            }

            const storedTransform = getStoredPreviewImageTransform(activeTimelineItem);
            if (!storedTransform) {
                return null;
            }

            return {
                left: storedTransform.left * viewportWidth,
                top: storedTransform.top * viewportHeight,
                width: storedTransform.width * viewportWidth,
                height: storedTransform.height * viewportHeight,
            };
        }

        function drawPreviewImageToExportCanvas() {
            if (!previewImage
                || previewImage.hidden
                || !previewImage.complete
                || !previewImageFrame
                || !previewViewport
            ) {
                return false;
            }

            const viewportWidth = Math.max(0, previewViewport.clientWidth);
            const viewportHeight = Math.max(0, previewViewport.clientHeight);

            if (viewportWidth === 0 || viewportHeight === 0) {
                return false;
            }

            const transform = getActivePreviewImageTransform(viewportWidth, viewportHeight);
            if (!transform) {
                return false;
            }

            const naturalWidth = Math.max(1, previewImage.naturalWidth || 0);
            const naturalHeight = Math.max(1, previewImage.naturalHeight || 0);

            const canvasWidth = Math.max(1, exportMirrorCanvas.width);
            const canvasHeight = Math.max(1, exportMirrorCanvas.height);
            const scaleX = canvasWidth / viewportWidth;
            const scaleY = canvasHeight / viewportHeight;

            if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) {
                return false;
            }

            exportMirrorContext.save();
            exportMirrorContext.setTransform(scaleX, 0, 0, scaleY, 0, 0);
            exportMirrorContext.beginPath();
            exportMirrorContext.rect(0, 0, viewportWidth, viewportHeight);
            exportMirrorContext.clip();

            exportMirrorContext.save();
            clipRoundRectPath(
                exportMirrorContext,
                transform.left,
                transform.top,
                transform.width,
                transform.height,
                getPreviewImageFrameBorderRadius(),
            );
            exportMirrorContext.clip();

            const scale = Math.max(transform.width / naturalWidth, transform.height / naturalHeight);
            if (!Number.isFinite(scale) || scale <= 0) {
                exportMirrorContext.restore();
                exportMirrorContext.restore();
                return false;
            }

            const drawWidth = naturalWidth * scale;
            const drawHeight = naturalHeight * scale;
            const drawX = transform.left + (transform.width - drawWidth) / 2;
            const drawY = transform.top + (transform.height - drawHeight) / 2;

            exportMirrorContext.drawImage(
                previewImage,
                drawX,
                drawY,
                drawWidth,
                drawHeight,
            );

            exportMirrorContext.restore();
            exportMirrorContext.restore();
            exportMirrorContext.setTransform(1, 0, 0, 1, 0, 0);
            return true;
        }

        function startPreviewMirroring(width, height) {
            if (!exportMirrorContext) {
                throw new Error('Unable to access export canvas context.');
            }

            exportMirrorCanvas.width = Math.max(1, Math.round(width));
            exportMirrorCanvas.height = Math.max(1, Math.round(height));

            let stopped = false;
            let rafId = 0;

            const drawFrame = () => {
                if (stopped) {
                    return;
                }

                exportMirrorContext.setTransform(1, 0, 0, 1, 0, 0);
                exportMirrorContext.fillStyle = '#000000';
                exportMirrorContext.fillRect(0, 0, exportMirrorCanvas.width, exportMirrorCanvas.height);

                if (!previewVideo.hidden && previewVideo.readyState >= 2) {
                    const dimensions = computeContainDimensions(
                        previewVideo.videoWidth,
                        previewVideo.videoHeight,
                        exportMirrorCanvas.width,
                        exportMirrorCanvas.height,
                    );
                    exportMirrorContext.drawImage(
                        previewVideo,
                        dimensions.x,
                        dimensions.y,
                        dimensions.width,
                        dimensions.height,
                    );
                } else if (!previewImage.hidden && previewImage.complete) {
                    const drewImage = drawPreviewImageToExportCanvas();
                    if (!drewImage) {
                        const fallbackDimensions = computeContainDimensions(
                            previewImage.naturalWidth,
                            previewImage.naturalHeight,
                            exportMirrorCanvas.width,
                            exportMirrorCanvas.height,
                        );
                        exportMirrorContext.drawImage(
                            previewImage,
                            fallbackDimensions.x,
                            fallbackDimensions.y,
                            fallbackDimensions.width,
                            fallbackDimensions.height,
                        );
                    }
                } else {
                    exportMirrorContext.fillStyle = '#1f2937';
                    exportMirrorContext.fillRect(0, 0, exportMirrorCanvas.width, exportMirrorCanvas.height);
                    exportMirrorContext.fillStyle = '#e2e8f0';
                    exportMirrorContext.textAlign = 'center';
                    exportMirrorContext.textBaseline = 'middle';
                    const fontSize = Math.max(18, Math.round(exportMirrorCanvas.height / 18));
                    exportMirrorContext.font = `600 ${fontSize}px Inter, "Segoe UI", sans-serif`;
                    exportMirrorContext.fillText(
                        'Preparing preview…',
                        exportMirrorCanvas.width / 2,
                        exportMirrorCanvas.height / 2,
                    );
                }

                rafId = window.requestAnimationFrame(drawFrame);
            };

            drawFrame();

            return () => {
                stopped = true;
                if (rafId) {
                    window.cancelAnimationFrame(rafId);
                    rafId = 0;
                }
            };
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

        function formatSecondsLabel(durationMs) {
            const safeMs = Math.max(0, Number(durationMs) || 0);
            const seconds = safeMs / 1000;
            if (seconds <= 0) {
                return '0s';
            }
            if (Number.isInteger(seconds)) {
                return `${seconds}s`;
            }
            return `${seconds.toFixed(1)}s`;
        }

        function describeFileType(fileType) {
            if (typeof fileType !== 'string' || !fileType.length) {
                return 'Media clip';
            }
            if (fileType.startsWith('video/')) {
                return 'Video clip';
            }
            if (fileType.startsWith('image/')) {
                return 'Image frame';
            }
            return 'Media clip';
        }

        function getSelectedAspectLabel() {
            if (!previewAspectSelect) {
                return '16:9 (Landscape)';
            }
            const selectedOption = previewAspectSelect.selectedOptions?.[0];
            return selectedOption?.textContent?.trim() || `${previewAspectSelect.value} ratio`;
        }

        function updatePreviewAspectLabel() {
            if (!previewAspectLabel) {
                return;
            }
            previewAspectLabel.textContent = getSelectedAspectLabel();
        }

        function renderExportSummary(timelineItems, playbackCompleted = null) {
            if (exportSummaryClips) {
                exportSummaryClips.textContent = String(timelineItems.length);
            }

            const totalDuration = Math.max(getTotalTimelineDuration(), 0);
            if (exportSummaryDuration) {
                const formattedDuration = formatTime(totalDuration);
                exportSummaryDuration.textContent = `${formattedDuration} (${formatSecondsLabel(totalDuration)})`;
            }

            const selectedQuality = videoQualitySelect?.value || '720p';
            const selectedAspect = previewAspectSelect?.value || '16:9';
            const selectedAspectLabel = getSelectedAspectLabel();
            const exportFormat = getSupportedExportFormat();
            const resolution = getExportResolution(selectedAspect, selectedQuality);

            if (exportSummaryResolution) {
                if (resolution) {
                    const dimensionLabel = `${resolution.width}×${resolution.height}`;
                    exportSummaryResolution.textContent = `${selectedQuality} ${dimensionLabel} (${selectedAspectLabel})`;
                } else {
                    exportSummaryResolution.textContent = `${selectedQuality} ${selectedAspectLabel}`;
                }
            }

            if (exportSummaryFormat) {
                exportSummaryFormat.textContent = exportFormat
                    ? `${selectedQuality} ${exportFormat.label}`
                    : 'Export format not supported in this browser';
            }

            if (exportDialogStatus) {
                if (playbackCompleted === true) {
                    exportDialogStatus.dataset.state = 'ready';
                    exportDialogStatus.textContent = 'Preview completed successfully. Ready to export.';
                } else if (playbackCompleted === false) {
                    exportDialogStatus.dataset.state = 'warning';
                    exportDialogStatus.textContent = 'Preview interrupted before completion. Review the details below.';
                } else {
                    exportDialogStatus.dataset.state = 'ready';
                    exportDialogStatus.textContent = 'Review your export settings and timeline before exporting.';
                }
            }

            if (exportTimelineList) {
                exportTimelineList.innerHTML = '';
                if (!timelineItems.length) {
                    const emptyMessage = document.createElement('p');
                    emptyMessage.className = 'export-dialog__subtitle';
                    emptyMessage.textContent = 'No media in the timeline. Add clips to export.';
                    exportTimelineList.appendChild(emptyMessage);
                } else {
                    const list = document.createElement('ul');
                    list.className = 'export-timeline-list__items';
                    timelineItems.forEach((timelineItem, index) => {
                        const listItem = document.createElement('li');
                        listItem.className = 'export-timeline-list__item';

                        const clipName = document.createElement('span');
                        clipName.className = 'export-timeline-clip-name';
                        const displayName = timelineItem.dataset.displayName
                            || timelineItem.dataset.fileName
                            || timelineItem.querySelector('span')?.textContent
                            || `Clip ${index + 1}`;
                        clipName.textContent = `${index + 1}. ${displayName}`;

                        const clipMeta = document.createElement('span');
                        clipMeta.className = 'export-timeline-clip-meta';
                        const duration = getTimelineItemPlaybackDuration(timelineItem);
                        clipMeta.textContent = `${describeFileType(timelineItem.dataset.fileType || '')} • ${formatTime(duration)} (${formatSecondsLabel(duration)})`;

                        listItem.appendChild(clipName);
                        listItem.appendChild(clipMeta);
                        list.appendChild(listItem);
                    });
                    exportTimelineList.appendChild(list);
                }
            }
        }

        function openExportDialog() {
            if (!exportDialog) {
                return;
            }
            exportDialog.hidden = false;
            exportDialog.removeAttribute('hidden');
            exportDialog.setAttribute('aria-hidden', 'false');
        }

        function closeExportDialog() {
            if (!exportDialog) {
                return;
            }
            exportDialog.hidden = true;
            exportDialog.setAttribute('hidden', '');
            exportDialog.setAttribute('aria-hidden', 'true');
        }

        function isExportDialogOpen() {
            return Boolean(exportDialog && !exportDialog.hasAttribute('hidden'));
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

        function getTimelineFractionForTime(timeMs) {
            const total = getTotalTimelineDuration();
            if (!total) {
                return 0;
            }
            return clampProgress(Math.max(0, timeMs) / total);
        }

        function seekTimelineToFraction(fraction) {
            const items = getTimelineItems();
            const totalDuration = Math.max(getTotalTimelineDuration(), 0);
            const clampedFraction = clampProgress(Number.isFinite(fraction) ? fraction : 0);

            if (!items.length || totalDuration <= 0) {
                setActiveTimelineItem(null);
                loadPreviewFromTimeline(null);
                resetTimelineProgressLine(0);
                updatePlaybackTimeDisplay(0, totalDuration);
                renderExportSummary(items, null);
                return;
            }

            const targetTime = clampedFraction * totalDuration;
            let activeItem = items[items.length - 1];

            for (const item of items) {
                const startTime = getTimelineItemStartTime(item);
                const duration = getTimelineItemPlaybackDuration(item);
                const endTime = startTime + duration;
                if (targetTime < endTime || item === items[items.length - 1]) {
                    activeItem = item;
                    break;
                }
            }

            setActiveTimelineItem(activeItem);
            loadPreviewFromTimeline(activeItem);

            resetTimelineProgressLine(clampedFraction);

            const displayTime = Math.min(Math.max(targetTime, 0), totalDuration);
            updatePlaybackTimeDisplay(displayTime, totalDuration);

            renderExportSummary(items, null);
        }

        function scrollTimelineItemIntoView(timelineItem) {
            if (!timelineItem) {
                return;
            }
            timelineItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }

        function getTimelineLanes() {
            if (!timelineLaneList) {
                return [];
            }
            return Array.from(timelineLaneList.querySelectorAll('.timeline-lane'));
        }

        function refreshTimelineLaneIndices() {
            getTimelineLanes().forEach((lane, index) => {
                const laneIndex = String(index);
                lane.dataset.laneIndex = laneIndex;
                lane.querySelectorAll('.timeline-item').forEach((item) => {
                    item.dataset.laneIndex = laneIndex;
                });
            });
        }

        function ensureTimelineLane(index = 0) {
            if (!timelineLaneList) {
                return null;
            }

            const clampedIndex = Math.max(0, Math.min(index, MAX_TIMELINE_LANES - 1));

            let lanes = getTimelineLanes();
            while (lanes.length <= clampedIndex && lanes.length < MAX_TIMELINE_LANES) {
                const lane = document.createElement('div');
                lane.className = 'timeline-lane';
                timelineLaneList.appendChild(lane);
                lanes = getTimelineLanes();
            }
            refreshTimelineLaneIndices();
            lanes = getTimelineLanes();
            return lanes[clampedIndex] || lanes[lanes.length - 1] || null;
        }

        function cleanupEmptyTimelineLanes() {
            if (!timelineLaneList) {
                return;
            }

            const lanes = getTimelineLanes();
            lanes.forEach((lane) => {
                if (lane && !lane.querySelector('.timeline-item') && lanes.length > 1) {
                    lane.remove();
                }
            });
            refreshTimelineLaneIndices();
            updateTimelineEmptyState();
        }

        function updateTimelineEmptyState() {
            if (!timelineEmptyState || !timelineTrack) {
                return;
            }
            const hasItems = Boolean(timelineTrack.querySelector('.timeline-item'));
            timelineEmptyState.hidden = hasItems;
            if (hasItems) {
                timelineTrack.classList.remove('timeline-track--empty');
            } else {
                timelineTrack.classList.add('timeline-track--empty');
                if (timelineLaneList) {
                    timelineLaneList.style.minWidth = '';
                    delete timelineLaneList.dataset.extendedWidth;
                }
                cancelTimelineAutoExtend();
            }
        }

        function setActiveDropLane(nextLane) {
            if (activeDropLane === nextLane) {
                return;
            }
            if (activeDropLane) {
                activeDropLane.classList.remove('is-drop-target');
            }
            activeDropLane = nextLane || null;
            if (activeDropLane) {
                activeDropLane.classList.add('is-drop-target');
            }
        }

        function getTimelineLaneFromEvent(event) {
            const lanes = getTimelineLanes();
            if (!lanes.length) {
                return ensureTimelineLane(0);
            }

            const pointerY = event.clientY;
            let closestLane = null;
            let closestDistance = Number.POSITIVE_INFINITY;

            lanes.forEach((lane) => {
                const rect = lane.getBoundingClientRect();
                if (!rect) {
                    return;
                }
                const { top, bottom, height } = rect;
                const center = top + height / 2;
                if (pointerY >= top && pointerY <= bottom) {
                    closestLane = lane;
                    closestDistance = 0;
                } else {
                    const distance = Math.abs(pointerY - center);
                    if (distance < closestDistance) {
                        closestLane = lane;
                        closestDistance = distance;
                    }
                }
            });

            const lastLane = lanes[lanes.length - 1];
            if (lastLane) {
                const rect = lastLane.getBoundingClientRect();
                if (rect && pointerY > rect.bottom + 32) {
                    if (lanes.length < MAX_TIMELINE_LANES) {
                        return ensureTimelineLane(lanes.length);
                    }
                    return lastLane;
                }
            }

            return closestLane || ensureTimelineLane(0);
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

        function cancelTimelineAutoExtend() {
            if (timelineAutoExtendFrame !== null) {
                window.cancelAnimationFrame(timelineAutoExtendFrame);
                timelineAutoExtendFrame = null;
            }
        }

        function applyTimelineAutoExtend(pointerClientX) {
            if (!timelineTrack || !timelineLaneList) {
                return;
            }

            if (!Number.isFinite(pointerClientX)) {
                return;
            }

            const trackRect = timelineTrack.getBoundingClientRect();
            if (!trackRect) {
                return;
            }

            const extendThreshold = TIMELINE_AUTO_EXTEND_THRESHOLD;
            const extendStep = TIMELINE_AUTO_EXTEND_STEP;

            if (pointerClientX >= trackRect.right - extendThreshold) {
                const pointerOffset = pointerClientX - trackRect.left + timelineTrack.scrollLeft;
                const laneRect = timelineLaneList.getBoundingClientRect();
                const currentWidth = laneRect ? laneRect.width : timelineLaneList.scrollWidth;
                const storedWidth = Number.parseFloat(timelineLaneList.dataset.extendedWidth || '0') || 0;
                const effectiveWidth = Math.max(currentWidth, storedWidth);
                const desiredWidth = Math.max(pointerOffset + extendStep, effectiveWidth);

                if (desiredWidth > storedWidth) {
                    const applied = Math.ceil(desiredWidth);
                    timelineLaneList.style.minWidth = `${applied}px`;
                    timelineLaneList.dataset.extendedWidth = String(applied);
                }

                const maxScrollLeft = Math.max(0, timelineTrack.scrollWidth - timelineTrack.clientWidth);
                timelineTrack.scrollLeft = maxScrollLeft;
                scheduleTimelineIndicatorUpdate();
                return;
            }

            if (pointerClientX <= trackRect.left + extendThreshold) {
                const nextScroll = Math.max(0, timelineTrack.scrollLeft - extendStep);
                if (nextScroll !== timelineTrack.scrollLeft) {
                    timelineTrack.scrollLeft = nextScroll;
                }
            }
        }

        function scheduleTimelineAutoExtend(pointerClientX) {
            if (!Number.isFinite(pointerClientX)) {
                return;
            }

            if (timelineAutoExtendFrame !== null) {
                window.cancelAnimationFrame(timelineAutoExtendFrame);
            }

            timelineAutoExtendFrame = window.requestAnimationFrame(() => {
                timelineAutoExtendFrame = null;
                applyTimelineAutoExtend(pointerClientX);
            });
        }

        function extendTimelineTrack(step = TIMELINE_AUTO_EXTEND_STEP) {
            if (!timelineTrack || !timelineLaneList) {
                return;
            }

            const safeStep = Number.isFinite(step) && step > 0 ? step : TIMELINE_AUTO_EXTEND_STEP;
            const laneRect = timelineLaneList.getBoundingClientRect();
            const currentWidth = laneRect?.width ? laneRect.width : timelineLaneList.scrollWidth;
            const storedWidth = Number.parseFloat(timelineLaneList.dataset.extendedWidth || '0') || 0;
            const baseline = Math.max(currentWidth, storedWidth, timelineTrack.clientWidth);
            const desiredWidth = Math.ceil(baseline + safeStep);

            if (desiredWidth <= storedWidth) {
                return;
            }

            timelineLaneList.style.minWidth = `${desiredWidth}px`;
            timelineLaneList.dataset.extendedWidth = String(desiredWidth);
            timelineTrack.scrollLeft = Math.max(0, timelineTrack.scrollWidth - timelineTrack.clientWidth);
            scheduleTimelineIndicatorUpdate();
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

                scheduleTimelineAutoExtend(moveEvent.clientX);

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
                cancelTimelineAutoExtend();
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
                setActiveDropLane(null);
                cancelTimelineAutoExtend();
                cleanupEmptyTimelineLanes();
                updateTimelineEmptyState();
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
                const lane = getTimelineLaneFromEvent(event);
                if (!lane) {
                    return;
                }
                setActiveDropLane(lane);
                const afterElement = getDragAfterElement(lane, event.clientX);
                if (!afterElement) {
                    lane.appendChild(draggingItem);
                } else if (afterElement !== draggingItem) {
                    lane.insertBefore(draggingItem, afterElement);
                }
                draggingItem.dataset.laneIndex = lane.dataset.laneIndex || '0';
                scheduleTimelineAutoExtend(event.clientX);
            });

            timelineTrack.addEventListener('drop', (event) => {
                event.preventDefault();
                const draggingItem = timelineTrack.querySelector('.timeline-item.dragging');
                if (draggingItem) {
                    draggingItem.classList.remove('dragging');
                    draggingItem.draggable = true;
                }
                setActiveDropLane(null);
                cancelTimelineAutoExtend();
                cleanupEmptyTimelineLanes();
                updateTimelineEmptyState();
                updateActiveTimelineIndicators();
            });
        }

        ensureTimelineLane(0);
        updateTimelineEmptyState();

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
                handlePreviewViewportResized();
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
            handlePreviewViewportResized();
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

        function getPreviewViewportSize() {
            if (!previewViewport) {
                return { width: 0, height: 0 };
            }
            return {
                width: Math.max(0, previewViewport.clientWidth),
                height: Math.max(0, previewViewport.clientHeight),
            };
        }

        function evaluatePreviewImageAlignment(transform, viewportSize, tolerance = PREVIEW_ALIGNMENT_TOLERANCE) {
            if (!transform || !viewportSize) {
                return {
                    left: false,
                    right: false,
                    top: false,
                    bottom: false,
                };
            }

            const { width: viewportWidth, height: viewportHeight } = viewportSize;

            if (viewportWidth <= 0 || viewportHeight <= 0) {
                return {
                    left: false,
                    right: false,
                    top: false,
                    bottom: false,
                };
            }

            const safeTolerance = Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : 0;
            const leftDelta = transform.left;
            const topDelta = transform.top;
            const rightDelta = viewportWidth - (transform.left + transform.width);
            const bottomDelta = viewportHeight - (transform.top + transform.height);

            return {
                left: Math.abs(leftDelta) <= safeTolerance,
                right: Math.abs(rightDelta) <= safeTolerance,
                top: Math.abs(topDelta) <= safeTolerance,
                bottom: Math.abs(bottomDelta) <= safeTolerance,
            };
        }

        function clamp(value, min, max) {
            const safeMin = Number.isFinite(min) ? min : 0;
            const safeMax = Number.isFinite(max) ? max : safeMin;
            const safeValue = Number.isFinite(value) ? value : safeMin;
            if (safeMin > safeMax) {
                return safeMin;
            }
            return Math.min(Math.max(safeValue, safeMin), safeMax);
        }

        function resetPreviewGuideElements() {
            if (previewGuideElements) {
                Object.values(previewGuideElements).forEach((element) => {
                    if (!element) {
                        return;
                    }
                    element.style.display = 'none';
                    element.style.removeProperty('left');
                    element.style.removeProperty('right');
                    element.style.removeProperty('top');
                    element.style.removeProperty('bottom');
                    element.style.removeProperty('width');
                    element.style.removeProperty('height');
                    element.removeAttribute('data-state');
                });
            }

            if (previewGuideMeasurements) {
                Object.values(previewGuideMeasurements).forEach((element) => {
                    if (!element) {
                        return;
                    }
                    element.style.display = 'none';
                    element.textContent = '';
                    element.style.removeProperty('left');
                    element.style.removeProperty('top');
                    element.removeAttribute('data-placement');
                });
            }

            if (previewRulerElements) {
                const { horizontal, vertical, horizontalLabel, verticalLabel } = previewRulerElements;
                if (horizontal) {
                    horizontal.classList.remove('is-visible');
                    horizontal.style.removeProperty('--marker-start');
                    horizontal.style.removeProperty('--marker-end');
                }
                if (vertical) {
                    vertical.classList.remove('is-visible');
                    vertical.style.removeProperty('--marker-start');
                    vertical.style.removeProperty('--marker-end');
                }
                if (horizontalLabel) {
                    horizontalLabel.textContent = '';
                }
                if (verticalLabel) {
                    verticalLabel.textContent = '';
                }
            }
        }

        function setPreviewGuidesVisible(isVisible) {
            if (!previewGuidesLayer) {
                return;
            }

            if (previewGuidesHideTimeout) {
                window.clearTimeout(previewGuidesHideTimeout);
                previewGuidesHideTimeout = null;
            }

            if (isVisible) {
                previewGuidesLayer.classList.add('is-active');
                previewGuidesLayer.removeAttribute('hidden');
                previewGuidesLayer.setAttribute('aria-hidden', 'false');
            } else {
                previewGuidesLayer.classList.remove('is-active');
                previewGuidesLayer.setAttribute('aria-hidden', 'true');
                if (!previewGuidesLayer.hasAttribute('hidden')) {
                    previewGuidesLayer.setAttribute('hidden', '');
                }
                resetPreviewGuideElements();
            }
        }

        function schedulePreviewGuidesHide(delay = 200) {
            if (!previewGuidesLayer) {
                return;
            }

            if (previewGuidesHideTimeout) {
                window.clearTimeout(previewGuidesHideTimeout);
            }

            previewGuidesHideTimeout = window.setTimeout(() => {
                previewGuidesHideTimeout = null;
                setPreviewGuidesVisible(false);
            }, Math.max(0, delay));
        }

        function hideGuideElement(element) {
            if (!element) {
                return;
            }
            element.style.display = 'none';
            element.style.removeProperty('left');
            element.style.removeProperty('right');
            element.style.removeProperty('top');
            element.style.removeProperty('bottom');
            element.style.removeProperty('width');
            element.style.removeProperty('height');
            element.removeAttribute('data-state');
        }

        function showGuideElement(element, styles = {}) {
            if (!element) {
                return;
            }

            element.style.display = 'block';
            element.style.removeProperty('left');
            element.style.removeProperty('right');
            element.style.removeProperty('top');
            element.style.removeProperty('bottom');
            element.style.removeProperty('width');
            element.style.removeProperty('height');

            Object.entries(styles).forEach(([key, value]) => {
                if (value === null || value === undefined || value === '') {
                    element.style.removeProperty(key);
                } else {
                    element.style[key] = value;
                }
            });
        }

        function updatePreviewGuides(transform, alignment) {
            if (!previewGuidesLayer
                || !previewGuideElements
                || !previewViewport
                || !previewGuidesLayer.classList.contains('is-active')) {
                return;
            }

            if (!transform) {
                resetPreviewGuideElements();
                return;
            }

            const viewportWidth = Math.max(0, previewViewport.clientWidth);
            const viewportHeight = Math.max(0, previewViewport.clientHeight);

            if (viewportWidth === 0 || viewportHeight === 0) {
                resetPreviewGuideElements();
                return;
            }

            const { left, top, width, height } = transform;

            if (![left, top, width, height].every((value) => Number.isFinite(value))) {
                resetPreviewGuideElements();
                return;
            }

            const safeAlignment = alignment
                || evaluatePreviewImageAlignment(transform, { width: viewportWidth, height: viewportHeight });

            const right = left + width;
            const bottom = top + height;
            const centerX = left + (width / 2);
            const centerY = top + (height / 2);
            const viewportCenterX = viewportWidth / 2;
            const viewportCenterY = viewportHeight / 2;

            const nearLeft = Math.abs(left) <= PREVIEW_GUIDE_NEAR_THRESHOLD;
            const nearRight = Math.abs(viewportWidth - right) <= PREVIEW_GUIDE_NEAR_THRESHOLD;
            const nearTop = Math.abs(top) <= PREVIEW_GUIDE_NEAR_THRESHOLD;
            const nearBottom = Math.abs(viewportHeight - bottom) <= PREVIEW_GUIDE_NEAR_THRESHOLD;
            const nearCenterX = Math.abs(centerX - viewportCenterX) <= PREVIEW_SMART_GUIDE_TOLERANCE;
            const nearCenterY = Math.abs(centerY - viewportCenterY) <= PREVIEW_SMART_GUIDE_TOLERANCE;

            if (safeAlignment.left) {
                showGuideElement(previewGuideElements.alignLeft, { left: '0px' });
            } else {
                hideGuideElement(previewGuideElements.alignLeft);
            }

            if (safeAlignment.right) {
                showGuideElement(previewGuideElements.alignRight, { left: `${viewportWidth}px` });
            } else {
                hideGuideElement(previewGuideElements.alignRight);
            }

            if (safeAlignment.top) {
                showGuideElement(previewGuideElements.alignTop, { top: '0px' });
            } else {
                hideGuideElement(previewGuideElements.alignTop);
            }

            if (safeAlignment.bottom) {
                showGuideElement(previewGuideElements.alignBottom, { top: `${viewportHeight}px` });
            } else {
                hideGuideElement(previewGuideElements.alignBottom);
            }

            if (nearCenterX) {
                showGuideElement(previewGuideElements.alignCenterVertical, { left: `${viewportCenterX}px` });
            } else {
                hideGuideElement(previewGuideElements.alignCenterVertical);
            }

            if (nearCenterY) {
                showGuideElement(previewGuideElements.alignCenterHorizontal, { top: `${viewportCenterY}px` });
            } else {
                hideGuideElement(previewGuideElements.alignCenterHorizontal);
            }

            if (!safeAlignment.left && nearLeft) {
                const leftEdge = clamp(left, 0, viewportWidth);
                showGuideElement(previewGuideElements.snapLeft, { left: `${leftEdge}px` });
            } else {
                hideGuideElement(previewGuideElements.snapLeft);
            }

            if (!safeAlignment.right && nearRight) {
                const rightEdge = clamp(right, 0, viewportWidth);
                showGuideElement(previewGuideElements.snapRight, { left: `${rightEdge}px` });
            } else {
                hideGuideElement(previewGuideElements.snapRight);
            }

            if (!safeAlignment.top && nearTop) {
                const topEdge = clamp(top, 0, viewportHeight);
                showGuideElement(previewGuideElements.snapTop, { top: `${topEdge}px` });
            } else {
                hideGuideElement(previewGuideElements.snapTop);
            }

            if (!safeAlignment.bottom && nearBottom) {
                const bottomEdge = clamp(bottom, 0, viewportHeight);
                showGuideElement(previewGuideElements.snapBottom, { top: `${bottomEdge}px` });
            } else {
                hideGuideElement(previewGuideElements.snapBottom);
            }

            const smartGuideElement = previewGuideElements.smartCenter;
            if (smartGuideElement) {
                if (nearCenterX || nearCenterY) {
                    showGuideElement(smartGuideElement, {
                        left: `${viewportCenterX}px`,
                        top: `${viewportCenterY}px`,
                    });
                    smartGuideElement.dataset.state = (nearCenterX && nearCenterY) ? 'locked' : 'active';
                } else {
                    hideGuideElement(smartGuideElement);
                }
            }

            if (previewGuideMeasurements?.size) {
                const sizeElement = previewGuideMeasurements.size;
                sizeElement.style.display = 'block';
                sizeElement.textContent = `${Math.round(width)} × ${Math.round(height)} px`;
                const labelX = clamp(centerX, 32, viewportWidth - 32);
                const labelY = clamp(centerY, 32, viewportHeight - 32);
                sizeElement.style.left = `${labelX}px`;
                sizeElement.style.top = `${labelY}px`;
            }

            if (previewGuideMeasurements?.position) {
                const positionElement = previewGuideMeasurements.position;
                positionElement.style.display = 'block';
                positionElement.textContent = `x ${Math.round(left)} px • y ${Math.round(top)} px`;
                const labelX = clamp(centerX, 36, viewportWidth - 36);
                let labelY = top - 14;
                let placement = 'above';
                if (labelY < 18) {
                    labelY = top + height + 22;
                    placement = 'below';
                }
                labelY = clamp(labelY, 18, viewportHeight - 18);
                positionElement.style.left = `${labelX}px`;
                positionElement.style.top = `${labelY}px`;
                positionElement.setAttribute('data-placement', placement);
            }

            if (previewRulerElements?.horizontal) {
                const startX = clamp(left, 0, viewportWidth);
                const endX = clamp(right, 0, viewportWidth);
                previewRulerElements.horizontal.classList.add('is-visible');
                previewRulerElements.horizontal.style.setProperty('--marker-start', `${startX}px`);
                previewRulerElements.horizontal.style.setProperty('--marker-end', `${endX}px`);
                if (previewRulerElements.horizontalLabel) {
                    previewRulerElements.horizontalLabel.textContent = `X ${Math.round(left)} • W ${Math.round(width)}`;
                }
            }

            if (previewRulerElements?.vertical) {
                const startY = clamp(top, 0, viewportHeight);
                const endY = clamp(bottom, 0, viewportHeight);
                previewRulerElements.vertical.classList.add('is-visible');
                previewRulerElements.vertical.style.setProperty('--marker-start', `${startY}px`);
                previewRulerElements.vertical.style.setProperty('--marker-end', `${endY}px`);
                if (previewRulerElements.verticalLabel) {
                    previewRulerElements.verticalLabel.textContent = `Y ${Math.round(top)} • H ${Math.round(height)}`;
                }
            }
        }

        function updatePreviewViewportAlignmentState(alignment) {
            if (!previewViewport) {
                return;
            }

            const resolved = alignment || {
                left: false,
                right: false,
                top: false,
                bottom: false,
            };

            let hasAny = false;
            let hasAll = true;

            (['left', 'right', 'top', 'bottom']).forEach((edge) => {
                const isAligned = Boolean(resolved[edge]);
                hasAny = hasAny || isAligned;
                hasAll = hasAll && isAligned;
                if (previewViewportAlignmentState[edge] !== isAligned) {
                    previewViewport.classList.toggle(PREVIEW_ALIGNMENT_CLASSES[edge], isAligned);
                    previewViewportAlignmentState[edge] = isAligned;
                }
            });

            previewViewport.classList.toggle('is-aligned', hasAny);
            previewViewport.classList.toggle('is-fully-aligned', hasAll);
        }

        function resetPreviewViewportAlignmentState() {
            if (!previewViewport) {
                return;
            }

            (['left', 'right', 'top', 'bottom']).forEach((edge) => {
                previewViewport.classList.remove(PREVIEW_ALIGNMENT_CLASSES[edge]);
                previewViewportAlignmentState[edge] = false;
            });

            previewViewport.classList.remove('is-aligned', 'is-fully-aligned');
        }

        function snapPreviewImageTransform(transform, options = {}) {
            if (!transform) {
                return {
                    transform: null,
                    alignment: evaluatePreviewImageAlignment(null, getPreviewViewportSize()),
                };
            }

            const viewportSize = getPreviewViewportSize();
            const snappedTransform = { ...transform };

            if (viewportSize.width > 0 && viewportSize.height > 0) {
                const threshold = PREVIEW_IMAGE_SNAP_THRESHOLD;
                if (options.mode === 'drag') {
                    if (Math.abs(snappedTransform.left) <= threshold) {
                        snappedTransform.left = 0;
                    }

                    const rightDelta = viewportSize.width - (snappedTransform.left + snappedTransform.width);
                    if (Math.abs(rightDelta) <= threshold) {
                        snappedTransform.left += rightDelta;
                    }

                    if (Math.abs(snappedTransform.top) <= threshold) {
                        snappedTransform.top = 0;
                    }

                    const bottomDelta = viewportSize.height - (snappedTransform.top + snappedTransform.height);
                    if (Math.abs(bottomDelta) <= threshold) {
                        snappedTransform.top += bottomDelta;
                    }
                } else if (options.mode === 'resize') {
                    const handle = typeof options.handle === 'string' ? options.handle.toLowerCase() : '';

                    if (handle) {
                        const hasWest = handle.includes('w');
                        const hasEast = handle.includes('e');
                        const hasNorth = handle.includes('n');
                        const hasSouth = handle.includes('s');

                        const origin = options.origin || null;
                        let aspectRatio = transform.aspectRatio > 0 ? transform.aspectRatio : null;
                        if (!aspectRatio) {
                            const ratio = transform.width / transform.height;
                            aspectRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
                        }

                        const anchorX = hasWest
                            ? origin?.oppositeX ?? (transform.left + transform.width)
                            : origin?.left ?? transform.left;
                        const anchorY = hasNorth
                            ? origin?.oppositeY ?? (transform.top + transform.height)
                            : origin?.top ?? transform.top;

                        let movingX = hasWest ? transform.left : transform.left + transform.width;
                        let movingY = hasNorth ? transform.top : transform.top + transform.height;

                        let snappedHorizontal = false;
                        let snappedVertical = false;

                        if (hasWest && Math.abs(movingX) <= threshold) {
                            movingX = 0;
                            snappedHorizontal = true;
                        } else if (hasEast && Math.abs(viewportSize.width - movingX) <= threshold) {
                            movingX = viewportSize.width;
                            snappedHorizontal = true;
                        }

                        if (hasNorth && Math.abs(movingY) <= threshold) {
                            movingY = 0;
                            snappedVertical = true;
                        } else if (hasSouth && Math.abs(viewportSize.height - movingY) <= threshold) {
                            movingY = viewportSize.height;
                            snappedVertical = true;
                        }

                        if (snappedHorizontal || snappedVertical) {
                            const horizontalDelta = movingX - anchorX;
                            const verticalDelta = movingY - anchorY;
                            const horizontalDirection = horizontalDelta === 0
                                ? (hasEast ? 1 : -1)
                                : Math.sign(horizontalDelta);
                            const verticalDirection = verticalDelta === 0
                                ? (hasSouth ? 1 : -1)
                                : Math.sign(verticalDelta);

                            let widthMagnitude = Math.abs(horizontalDelta);
                            let heightMagnitude = Math.abs(verticalDelta);

                            const targetHeightFromWidth = widthMagnitude / aspectRatio;
                            const targetWidthFromHeight = heightMagnitude * aspectRatio;

                            if (snappedHorizontal && !snappedVertical) {
                                heightMagnitude = targetHeightFromWidth;
                                movingY = anchorY + (verticalDirection || 1) * heightMagnitude;
                            } else if (snappedVertical && !snappedHorizontal) {
                                widthMagnitude = targetWidthFromHeight;
                                movingX = anchorX + (horizontalDirection || 1) * widthMagnitude;
                            } else {
                                const deltaHeight = Math.abs(targetHeightFromWidth - heightMagnitude);
                                const deltaWidth = Math.abs(targetWidthFromHeight - widthMagnitude);
                                if (deltaHeight <= deltaWidth) {
                                    heightMagnitude = targetHeightFromWidth;
                                    movingY = anchorY + (verticalDirection || 1) * heightMagnitude;
                                } else {
                                    widthMagnitude = targetWidthFromHeight;
                                    movingX = anchorX + (horizontalDirection || 1) * widthMagnitude;
                                }
                            }

                            const nextLeft = Math.min(anchorX, movingX);
                            const nextTop = Math.min(anchorY, movingY);
                            const nextWidth = Math.max(Math.abs(movingX - anchorX), 0);
                            const nextHeight = Math.max(Math.abs(movingY - anchorY), 0);

                            snappedTransform.left = nextLeft;
                            snappedTransform.top = nextTop;
                            snappedTransform.width = nextWidth;
                            snappedTransform.height = nextHeight;
                            snappedTransform.aspectRatio = aspectRatio;
                        }
                    }
                }
            }

            if (viewportSize.width > 0 && viewportSize.height > 0) {
                const viewportCenterX = viewportSize.width / 2;
                const viewportCenterY = viewportSize.height / 2;
                const currentCenterX = snappedTransform.left + (snappedTransform.width / 2);
                const currentCenterY = snappedTransform.top + (snappedTransform.height / 2);

                if (Math.abs(currentCenterX - viewportCenterX) <= PREVIEW_SMART_GUIDE_TOLERANCE) {
                    snappedTransform.left = viewportCenterX - (snappedTransform.width / 2);
                }

                if (Math.abs(currentCenterY - viewportCenterY) <= PREVIEW_SMART_GUIDE_TOLERANCE) {
                    snappedTransform.top = viewportCenterY - (snappedTransform.height / 2);
                }
            }

            const alignment = evaluatePreviewImageAlignment(snappedTransform, viewportSize);

            return {
                transform: snappedTransform,
                alignment,
            };
        }

        function getStoredPreviewImageTransform(timelineItem) {
            if (!timelineItem) {
                return null;
            }

            const raw = timelineItem.dataset.previewImageTransform || '';

            if (!raw) {
                return null;
            }

            try {
                const parsed = JSON.parse(raw);
                const keys = ['left', 'top', 'width', 'height'];
                const hasAll = keys.every((key) => Number.isFinite(parsed[key]));

                if (!hasAll) {
                    return null;
                }

                const aspectRatio = Number.isFinite(parsed.aspectRatio) && parsed.aspectRatio > 0
                    ? parsed.aspectRatio
                    : null;

                return {
                    left: parsed.left,
                    top: parsed.top,
                    width: parsed.width,
                    height: parsed.height,
                    aspectRatio,
                };
            } catch (error) {
                console.warn('Unable to parse stored preview image transform.', error);
                return null;
            }
        }

        function applyStoredPreviewImageTransform(storedTransform, viewportSizeOverride = null) {
            if (!storedTransform) {
                return false;
            }

            const viewportSize = viewportSizeOverride || getPreviewViewportSize();
            const viewportWidth = Math.max(0, viewportSize.width || 0);
            const viewportHeight = Math.max(0, viewportSize.height || 0);

            if (viewportWidth <= 0 || viewportHeight <= 0) {
                return false;
            }

            const nextWidth = storedTransform.width * viewportWidth;
            const nextHeight = storedTransform.height * viewportHeight;
            const nextAspectRatio = storedTransform.aspectRatio && storedTransform.aspectRatio > 0
                ? storedTransform.aspectRatio
                : ((nextWidth > 0 && nextHeight > 0) ? nextWidth / nextHeight : 1);

            if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight)) {
                return false;
            }

            previewImageTransform = {
                left: storedTransform.left * viewportWidth,
                top: storedTransform.top * viewportHeight,
                width: nextWidth,
                height: nextHeight,
                aspectRatio: nextAspectRatio > 0 ? nextAspectRatio : 1,
            };

            lastPreviewViewportSize = { width: viewportWidth, height: viewportHeight };
            applyPreviewImageTransform();
            return true;
        }

        function tryRestorePreviewImageTransform(timelineItem) {
            const storedTransform = getStoredPreviewImageTransform(timelineItem);

            if (!storedTransform) {
                pendingPreviewImageTransform = null;
                return false;
            }

            if (applyStoredPreviewImageTransform(storedTransform)) {
                pendingPreviewImageTransform = null;
            } else {
                pendingPreviewImageTransform = storedTransform;
                schedulePreviewViewportSizeUpdate();
            }

            return true;
        }

        function persistPreviewImageTransformForActiveTimelineItem() {
            if (!activeTimelineItem || !previewImageTransform || !previewViewport) {
                return;
            }

            const fileType = activeTimelineItem.dataset.fileType || '';

            if (!fileType.startsWith('image/')) {
                return;
            }

            const viewportSize = getPreviewViewportSize();
            const viewportWidth = Math.max(0, viewportSize.width || 0);
            const viewportHeight = Math.max(0, viewportSize.height || 0);

            if (viewportWidth <= 0 || viewportHeight <= 0) {
                return;
            }

            const normalized = {
                left: previewImageTransform.left / viewportWidth,
                top: previewImageTransform.top / viewportHeight,
                width: previewImageTransform.width / viewportWidth,
                height: previewImageTransform.height / viewportHeight,
                aspectRatio: previewImageTransform.aspectRatio && previewImageTransform.aspectRatio > 0
                    ? previewImageTransform.aspectRatio
                    : ((previewImageTransform.width > 0 && previewImageTransform.height > 0)
                        ? previewImageTransform.width / previewImageTransform.height
                        : 1),
            };

            const values = [normalized.left, normalized.top, normalized.width, normalized.height, normalized.aspectRatio];

            if (!values.every((value) => Number.isFinite(value))) {
                return;
            }

            activeTimelineItem.dataset.previewImageTransform = JSON.stringify(normalized);
        }

        function applyPreviewImageTransform(alignmentOverride) {
            if (!previewImageFrame || !previewImageTransform) {
                resetPreviewViewportAlignmentState();
                resetPreviewGuideElements();
                return;
            }

            previewImageFrame.style.transform = `translate3d(${previewImageTransform.left}px, ${previewImageTransform.top}px, 0)`;
            previewImageFrame.style.width = `${previewImageTransform.width}px`;
            previewImageFrame.style.height = `${previewImageTransform.height}px`;

            const alignment = alignmentOverride
                || evaluatePreviewImageAlignment(previewImageTransform, getPreviewViewportSize());
            updatePreviewViewportAlignmentState(alignment);
            updatePreviewOutsideOutline();
            updatePreviewGuides(previewImageTransform, alignment);
        }

        function clearPreviewImageTransform() {
            previewImageTransform = null;
            if (previewImageFrame) {
                previewImageFrame.style.removeProperty('transform');
                previewImageFrame.style.removeProperty('width');
                previewImageFrame.style.removeProperty('height');
                previewImageFrame.classList.remove('is-dragging', 'is-resizing');
            }
            resetPreviewViewportAlignmentState();
            hidePreviewOutsideOutline();
            setPreviewGuidesVisible(false);
        }

        function hidePreviewOutsideOutline() {
            if (!previewOutsideIndicator) {
                return;
            }

            previewOutsideIndicator.setAttribute('hidden', '');

            if (!previewOutsideSegments) {
                return;
            }

            Object.values(previewOutsideSegments).forEach((segment) => {
                if (!segment) {
                    return;
                }
                segment.style.display = 'none';
                segment.style.removeProperty('left');
                segment.style.removeProperty('top');
                segment.style.removeProperty('width');
                segment.style.removeProperty('height');
            });
        }

        function updatePreviewOutsideOutline() {
            if (!previewOutsideIndicator
                || !previewOutsideSegments
                || !previewImageTransform
                || !previewViewport
                || !previewCard) {
                hidePreviewOutsideOutline();
                return;
            }

            const viewportWidth = Math.max(0, previewViewport.clientWidth);
            const viewportHeight = Math.max(0, previewViewport.clientHeight);

            if (viewportWidth === 0 || viewportHeight === 0) {
                hidePreviewOutsideOutline();
                return;
            }

            const frameWidth = Math.max(0, previewImageTransform.width);
            const frameHeight = Math.max(0, previewImageTransform.height);

            if (frameWidth === 0 || frameHeight === 0) {
                hidePreviewOutsideOutline();
                return;
            }

            const overflowLeft = Math.min(Math.max(0, -previewImageTransform.left), frameWidth);
            const overflowTop = Math.min(Math.max(0, -previewImageTransform.top), frameHeight);
            const overflowRight = Math.min(
                Math.max(0, (previewImageTransform.left + frameWidth) - viewportWidth),
                frameWidth,
            );
            const overflowBottom = Math.min(
                Math.max(0, (previewImageTransform.top + frameHeight) - viewportHeight),
                frameHeight,
            );

            if (overflowLeft <= 0 && overflowTop <= 0 && overflowRight <= 0 && overflowBottom <= 0) {
                hidePreviewOutsideOutline();
                return;
            }

            const viewportRect = previewViewport.getBoundingClientRect();
            const cardRect = previewCard.getBoundingClientRect();

            const frameLeft = viewportRect.left - cardRect.left + previewImageTransform.left;
            const frameTop = viewportRect.top - cardRect.top + previewImageTransform.top;

            previewOutsideIndicator.removeAttribute('hidden');

            const { top, right, bottom, left } = previewOutsideSegments;

            if (left) {
                if (overflowLeft > 0) {
                    left.style.display = 'block';
                    left.style.left = `${frameLeft}px`;
                    left.style.top = `${frameTop}px`;
                    left.style.width = `${overflowLeft}px`;
                    left.style.height = `${frameHeight}px`;
                } else {
                    left.style.display = 'none';
                }
            }

            if (right) {
                if (overflowRight > 0) {
                    right.style.display = 'block';
                    right.style.left = `${frameLeft + frameWidth - overflowRight}px`;
                    right.style.top = `${frameTop}px`;
                    right.style.width = `${overflowRight}px`;
                    right.style.height = `${frameHeight}px`;
                } else {
                    right.style.display = 'none';
                }
            }

            if (top) {
                if (overflowTop > 0) {
                    top.style.display = 'block';
                    top.style.left = `${frameLeft}px`;
                    top.style.top = `${frameTop}px`;
                    top.style.width = `${frameWidth}px`;
                    top.style.height = `${overflowTop}px`;
                } else {
                    top.style.display = 'none';
                }
            }

            if (bottom) {
                if (overflowBottom > 0) {
                    bottom.style.display = 'block';
                    bottom.style.left = `${frameLeft}px`;
                    bottom.style.top = `${frameTop + frameHeight - overflowBottom}px`;
                    bottom.style.width = `${frameWidth}px`;
                    bottom.style.height = `${overflowBottom}px`;
                } else {
                    bottom.style.display = 'none';
                }
            }
        }

        function resetPreviewImageFrameToFit() {
            if (!previewImage || !previewImageFrame || !previewViewport || previewImage.hidden) {
                return;
            }

            if (tryRestorePreviewImageTransform(activeTimelineItem)) {
                return;
            }

            const viewportWidth = Math.max(0, previewViewport.clientWidth);
            const viewportHeight = Math.max(0, previewViewport.clientHeight);

            if (viewportWidth === 0 || viewportHeight === 0) {
                return;
            }

            const naturalWidth = Math.max(1, previewImage.naturalWidth || viewportWidth);
            const naturalHeight = Math.max(1, previewImage.naturalHeight || viewportHeight);
            const aspectRatio = naturalWidth / naturalHeight || 1;

            let targetWidth = viewportWidth;
            let targetHeight = targetWidth / aspectRatio;

            if (targetHeight > viewportHeight) {
                targetHeight = viewportHeight;
                targetWidth = targetHeight * aspectRatio;
            }

            const minimumWidth = Math.min(viewportWidth, MIN_IMAGE_FRAME_SIZE);
            if (targetWidth < minimumWidth) {
                targetWidth = minimumWidth;
                targetHeight = targetWidth / aspectRatio;
            }

            const left = (viewportWidth - targetWidth) / 2;
            const top = (viewportHeight - targetHeight) / 2;

            previewImageTransform = {
                left,
                top,
                width: targetWidth,
                height: targetHeight,
                aspectRatio: aspectRatio > 0 ? aspectRatio : 1,
            };

            lastPreviewViewportSize = { width: viewportWidth, height: viewportHeight };
            applyPreviewImageTransform();
        }

        function showPreviewImageLayer() {
            if (!previewImageLayer) {
                return;
            }
            previewImageLayer.removeAttribute('hidden');
        }

        function hidePreviewImageLayer() {
            if (!previewImageLayer) {
                return;
            }
            if (previewImagePointerState.pointerId !== null) {
                if (previewImageFrame?.hasPointerCapture?.(previewImagePointerState.pointerId)) {
                    previewImageFrame.releasePointerCapture(previewImagePointerState.pointerId);
                }
                previewResizeHandles.forEach((handle) => {
                    if (handle?.hasPointerCapture?.(previewImagePointerState.pointerId)) {
                        handle.releasePointerCapture(previewImagePointerState.pointerId);
                    }
                });
            }
            previewImageLayer.setAttribute('hidden', '');
            clearPreviewImageTransform();
            pendingPreviewImageTransform = null;
            shouldResetImageFrameOnNextViewportUpdate = false;
            lastPreviewViewportSize = null;
            previewImagePointerState.pointerId = null;
            previewImagePointerState.mode = null;
            previewImagePointerState.handle = null;
            previewImagePointerState.origin = null;
        }

        function queuePreviewImageFrameReset() {
            if (!previewImage || previewImage.hidden) {
                return;
            }
            shouldResetImageFrameOnNextViewportUpdate = true;
            schedulePreviewViewportSizeUpdate();
        }

        function handlePreviewViewportResized() {
            if (!previewViewport) {
                hidePreviewOutsideOutline();
                return;
            }

            const width = Math.max(0, previewViewport.clientWidth);
            const height = Math.max(0, previewViewport.clientHeight);

            if (width === 0 || height === 0) {
                lastPreviewViewportSize = { width, height };
                hidePreviewOutsideOutline();
                return;
            }

            if (pendingPreviewImageTransform) {
                const applied = applyStoredPreviewImageTransform(pendingPreviewImageTransform, { width, height });

                if (applied) {
                    pendingPreviewImageTransform = null;
                    lastPreviewViewportSize = { width, height };
                    return;
                }
            }

            if (shouldResetImageFrameOnNextViewportUpdate) {
                shouldResetImageFrameOnNextViewportUpdate = false;
                resetPreviewImageFrameToFit();
                lastPreviewViewportSize = { width, height };
                return;
            }

            if (!previewImageTransform) {
                lastPreviewViewportSize = { width, height };
                hidePreviewOutsideOutline();
                return;
            }

            if (!lastPreviewViewportSize || lastPreviewViewportSize.width === 0) {
                lastPreviewViewportSize = { width, height };
                hidePreviewOutsideOutline();
                return;
            }

            const scale = width / lastPreviewViewportSize.width;

            if (!Number.isFinite(scale) || scale <= 0) {
                lastPreviewViewportSize = { width, height };
                hidePreviewOutsideOutline();
                return;
            }

            const previousCenterX = previewImageTransform.left + (previewImageTransform.width / 2);
            const previousCenterY = previewImageTransform.top + (previewImageTransform.height / 2);

            const nextWidth = previewImageTransform.width * scale;
            const nextHeight = nextWidth / (previewImageTransform.aspectRatio || 1);
            const nextCenterX = previousCenterX * scale;
            const nextCenterY = previousCenterY * scale;

            previewImageTransform.left = nextCenterX - (nextWidth / 2);
            previewImageTransform.top = nextCenterY - (nextHeight / 2);
            previewImageTransform.width = nextWidth;
            previewImageTransform.height = nextHeight;

            lastPreviewViewportSize = { width, height };
            applyPreviewImageTransform();
        }

        function calculatePreviewImageResize(handle, deltaX, deltaY, origin) {
            const aspectRatio = origin.aspectRatio > 0 ? origin.aspectRatio : 1;
            const baseMin = Math.max(32, MIN_IMAGE_FRAME_SIZE);
            const minHeight = Math.max(32, baseMin / aspectRatio);

            const chooseWidth = (primary, secondary) => {
                const candidate = Math.abs(deltaX) >= Math.abs(deltaY) ? primary : secondary;
                return Math.max(baseMin, candidate);
            };

            switch (handle) {
                case 'nw': {
                    const widthFromDx = origin.width - deltaX;
                    const heightFromDy = origin.height - deltaY;
                    let nextWidth = chooseWidth(widthFromDx, heightFromDy * aspectRatio);
                    let nextHeight = nextWidth / aspectRatio;
                    if (nextHeight < minHeight) {
                        nextHeight = minHeight;
                        nextWidth = nextHeight * aspectRatio;
                    }
                    return {
                        left: origin.oppositeX - nextWidth,
                        top: origin.oppositeY - nextHeight,
                        width: nextWidth,
                        height: nextHeight,
                    };
                }
                case 'ne': {
                    const widthFromDx = origin.width + deltaX;
                    const heightFromDy = origin.height - deltaY;
                    let nextWidth = chooseWidth(widthFromDx, heightFromDy * aspectRatio);
                    let nextHeight = nextWidth / aspectRatio;
                    if (nextHeight < minHeight) {
                        nextHeight = minHeight;
                        nextWidth = nextHeight * aspectRatio;
                    }
                    return {
                        left: origin.left,
                        top: origin.oppositeY - nextHeight,
                        width: nextWidth,
                        height: nextHeight,
                    };
                }
                case 'sw': {
                    const widthFromDx = origin.width - deltaX;
                    const heightFromDy = origin.height + deltaY;
                    let nextWidth = chooseWidth(widthFromDx, heightFromDy * aspectRatio);
                    let nextHeight = nextWidth / aspectRatio;
                    if (nextHeight < minHeight) {
                        nextHeight = minHeight;
                        nextWidth = nextHeight * aspectRatio;
                    }
                    return {
                        left: origin.oppositeX - nextWidth,
                        top: origin.top,
                        width: nextWidth,
                        height: nextHeight,
                    };
                }
                case 'se':
                default: {
                    const widthFromDx = origin.width + deltaX;
                    const heightFromDy = origin.height + deltaY;
                    let nextWidth = chooseWidth(widthFromDx, heightFromDy * aspectRatio);
                    let nextHeight = nextWidth / aspectRatio;
                    if (nextHeight < minHeight) {
                        nextHeight = minHeight;
                        nextWidth = nextHeight * aspectRatio;
                    }
                    return {
                        left: origin.left,
                        top: origin.top,
                        width: nextWidth,
                        height: nextHeight,
                    };
                }
            }
        }

        function endPreviewImagePointerInteraction() {
            if (previewImageFrame) {
                previewImageFrame.classList.remove('is-dragging', 'is-resizing');
            }
            const hadInteraction = previewImagePointerState.mode !== null;
            previewImagePointerState.pointerId = null;
            previewImagePointerState.mode = null;
            previewImagePointerState.handle = null;
            previewImagePointerState.origin = null;
            if (hadInteraction) {
                persistPreviewImageTransformForActiveTimelineItem();
            }
            schedulePreviewGuidesHide();
        }

        function onPreviewImagePointerDown(event) {
            if (!previewImageFrame || !previewImageTransform || previewImage.hidden) {
                return;
            }

            if (event.button !== 0) {
                return;
            }

            const handleElement = event.target.closest('.preview-resize-handle');
            const captureTarget = handleElement || previewImageFrame;

            if (typeof captureTarget.setPointerCapture === 'function') {
                captureTarget.setPointerCapture(event.pointerId);
            }

            previewImagePointerState.pointerId = event.pointerId;
            previewImagePointerState.mode = handleElement ? 'resize' : 'drag';
            previewImagePointerState.handle = handleElement?.dataset.handle || 'se';
            previewImagePointerState.origin = {
                pointerX: event.clientX,
                pointerY: event.clientY,
                left: previewImageTransform.left,
                top: previewImageTransform.top,
                width: previewImageTransform.width,
                height: previewImageTransform.height,
                aspectRatio: previewImageTransform.aspectRatio || 1,
                oppositeX: previewImageTransform.left + previewImageTransform.width,
                oppositeY: previewImageTransform.top + previewImageTransform.height,
            };

            if (previewImagePointerState.mode === 'resize') {
                previewImageFrame.classList.add('is-resizing');
            } else {
                previewImageFrame.classList.add('is-dragging');
            }

            setPreviewGuidesVisible(true);
            updatePreviewGuides(
                previewImageTransform,
                evaluatePreviewImageAlignment(previewImageTransform, getPreviewViewportSize()),
            );

            event.preventDefault();
            event.stopPropagation();
        }

        function onPreviewImagePointerMove(event) {
            if (previewImagePointerState.pointerId === null || event.pointerId !== previewImagePointerState.pointerId) {
                return;
            }

            if (!previewImageTransform) {
                return;
            }

            setPreviewGuidesVisible(true);

            const deltaX = event.clientX - previewImagePointerState.origin.pointerX;
            const deltaY = event.clientY - previewImagePointerState.origin.pointerY;

            if (previewImagePointerState.mode === 'drag') {
                previewImageTransform.left = previewImagePointerState.origin.left + deltaX;
                previewImageTransform.top = previewImagePointerState.origin.top + deltaY;
            } else if (previewImagePointerState.mode === 'resize') {
                const next = calculatePreviewImageResize(
                    previewImagePointerState.handle || 'se',
                    deltaX,
                    deltaY,
                    previewImagePointerState.origin,
                );
                previewImageTransform.left = next.left;
                previewImageTransform.top = next.top;
                previewImageTransform.width = next.width;
                previewImageTransform.height = next.height;
                previewImageTransform.aspectRatio = previewImagePointerState.origin.aspectRatio;
            }

            const snapResult = snapPreviewImageTransform(previewImageTransform, {
                mode: previewImagePointerState.mode,
                handle: previewImagePointerState.handle,
                origin: previewImagePointerState.origin,
            });

            if (snapResult?.transform) {
                previewImageTransform.left = snapResult.transform.left;
                previewImageTransform.top = snapResult.transform.top;
                previewImageTransform.width = snapResult.transform.width;
                previewImageTransform.height = snapResult.transform.height;
                if (Number.isFinite(snapResult.transform.aspectRatio) && snapResult.transform.aspectRatio > 0) {
                    previewImageTransform.aspectRatio = snapResult.transform.aspectRatio;
                }
            }

            applyPreviewImageTransform(snapResult?.alignment);

            event.preventDefault();
            event.stopPropagation();
        }

        function onPreviewImagePointerUp(event) {
            if (previewImagePointerState.pointerId === null || event.pointerId !== previewImagePointerState.pointerId) {
                return;
            }

            if (typeof event.target.releasePointerCapture === 'function' && event.target.hasPointerCapture(event.pointerId)) {
                event.target.releasePointerCapture(event.pointerId);
            }

            endPreviewImagePointerInteraction();
        }

        function onPreviewImagePointerCancel(event) {
            if (previewImagePointerState.pointerId === null || event.pointerId !== previewImagePointerState.pointerId) {
                return;
            }

            if (typeof event.target.releasePointerCapture === 'function' && event.target.hasPointerCapture(event.pointerId)) {
                event.target.releasePointerCapture(event.pointerId);
            }

            endPreviewImagePointerInteraction();
        }

        function setPreviewImageVisibility(isVisible) {
            if (!previewImage) {
                return;
            }

            if (isVisible) {
                previewImage.hidden = false;
                showPreviewImageLayer();
                schedulePreviewViewportSizeUpdate();
                if (previewImage.complete) {
                    resetPreviewImageFrameToFit();
                } else {
                    queuePreviewImageFrameReset();
                }
            } else {
                previewImage.hidden = true;
                hidePreviewImageLayer();
            }
        }


        if (previewImage) {
            previewImage.addEventListener('load', () => {
                resetPreviewScroll();
                schedulePreviewViewportSizeUpdate();
                if (!previewImage.hidden) {
                    resetPreviewImageFrameToFit();
                }
            });
        }

        if (previewVideo) {
            previewVideo.addEventListener('loadeddata', () => {
                schedulePreviewViewportSizeUpdate();
            });
        }

        if (previewImageFrame) {
            previewImageFrame.addEventListener('pointerdown', onPreviewImagePointerDown);
        }

        if (window && typeof window.addEventListener === 'function') {
            window.addEventListener('pointermove', onPreviewImagePointerMove, { passive: false });
            window.addEventListener('pointerup', onPreviewImagePointerUp, { passive: true });
            window.addEventListener('pointercancel', onPreviewImagePointerCancel, { passive: true });
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
            queuePreviewImageFrameReset();
            if (isExportDialogOpen()) {
                renderExportSummary(getTimelineItems(), null);
            }
            updatePreviewAspectLabel();
        }

        if (previewAspectSelect) {
            previewAspectSelect.addEventListener('change', (event) => {
                setPreviewAspect(event.target.value);
            });
            setPreviewAspect(previewAspectSelect.value);
            updatePreviewAspectLabel();
        } else {
            setPreviewAspect('16:9');
            updatePreviewAspectLabel();
        }

        if (videoQualitySelect) {
            videoQualitySelect.addEventListener('change', () => {
                if (isExportDialogOpen()) {
                    renderExportSummary(getTimelineItems(), null);
                }
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
            setPreviewImageVisibility(false);
            previewImage.removeAttribute('src');
            previewPlaceholder.hidden = false;
            playVideoButton.textContent = 'Play Back';
            setPreviewMode(null);
            resetPreviewScroll();
            setActiveTimelineItem(null);
        }

        function setActiveTimelineItem(item, options = {}) {
            const shouldFocus = Boolean(options.focus);
            if (item !== activeTimelineItem) {
                persistPreviewImageTransformForActiveTimelineItem();
            }
            if (activeTimelineItem) {
                activeTimelineItem.classList.remove('active');
            }
            activeTimelineItem = item || null;
            if (activeTimelineItem) {
                activeTimelineItem.classList.add('active');
                scrollTimelineItemIntoView(activeTimelineItem);
                if (shouldFocus && typeof activeTimelineItem.focus === 'function') {
                    activeTimelineItem.focus();
                }
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
                setPreviewImageVisibility(false);
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
                setPreviewImageVisibility(true);
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
            const defaultLane = ensureTimelineLane(0);
            if (timelineEmptyState) {
                timelineEmptyState.hidden = true;
            }

            const timelineItem = document.createElement('div');
            timelineItem.className = 'timeline-item';
            timelineItem.setAttribute('role', 'listitem');
            timelineItem.tabIndex = 0;
            timelineItem.dataset.fileType = file.type;
            timelineItem.dataset.objectUrl = objectURL;
            timelineItem.dataset.displayName = file.name;

            const label = document.createElement('span');
            label.textContent = file.name;

            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'timeline-item-remove';
            removeButton.setAttribute('aria-label', 'Remove clip');
            removeButton.textContent = '✕';

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
            timelineItem.appendChild(removeButton);

            const targetLane = defaultLane || ensureTimelineLane(0);
            if (targetLane) {
                timelineItem.dataset.laneIndex = targetLane.dataset.laneIndex || '0';
                targetLane.appendChild(timelineItem);
            } else {
                timelineItem.dataset.laneIndex = '0';
                timelineTrack.appendChild(timelineItem);
            }
            initializeTimelineItem(timelineItem);
            updateTimelineEmptyState();

            timelineItem.addEventListener('click', () => {
                stopTimelinePlayback();
                setActiveTimelineItem(timelineItem);
                loadPreviewFromTimeline(timelineItem);
            });

            timelineItem.addEventListener('keydown', (event) => {
                const { key } = event;
                if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
                    event.preventDefault();
                    stopTimelinePlayback();
                    setActiveTimelineItem(timelineItem, { focus: true });
                    loadPreviewFromTimeline(timelineItem);
                    return;
                }

                if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') {
                    return;
                }

                event.preventDefault();
                const items = getTimelineItems();
                const currentIndex = items.indexOf(timelineItem);
                if (currentIndex === -1) {
                    return;
                }

                let nextIndex = currentIndex;
                if (key === 'ArrowLeft' || key === 'ArrowUp') {
                    nextIndex = Math.max(0, currentIndex - 1);
                } else if (key === 'ArrowRight' || key === 'ArrowDown') {
                    nextIndex = Math.min(items.length - 1, currentIndex + 1);
                }

                if (nextIndex === currentIndex) {
                    return;
                }

                const nextItem = items[nextIndex];
                if (!nextItem) {
                    return;
                }

                stopTimelinePlayback();
                setActiveTimelineItem(nextItem, { focus: true });
                loadPreviewFromTimeline(nextItem);
            });

            removeButton.addEventListener('click', (event) => {
                event.stopPropagation();
                const targetItem = removeButton.closest('.timeline-item');
                if (!targetItem) {
                    return;
                }
                const wasActive = targetItem === activeTimelineItem;
                const url = targetItem.dataset.objectUrl;
                targetItem.remove();
                if (url) {
                    URL.revokeObjectURL(url);
                }
                if (wasActive) {
                    setActiveTimelineItem(null);
                    clearPreview();
                }
                cleanupEmptyTimelineLanes();
                updateTimelineEmptyState();
                updateActiveTimelineIndicators();
                renderExportSummary(getTimelineItems(), null);
            });

            setActiveTimelineItem(timelineItem);
            loadPreviewFromTimeline(timelineItem);
        }

        uploadInput.addEventListener('change', async (event) => {
            const files = Array.from(event.target.files || []);
            if (!files.length) {
                if (uploadMetaStatus) {
                    uploadMetaStatus.textContent = 'No clips added yet';
                }
                if (uploadMetaHint) {
                    uploadMetaHint.textContent = 'Tip: drop multiple files to keep your story flowing.';
                }
                return;
            }

            if (uploadMetaStatus) {
                const clipLabel = files.length === 1 ? 'clip' : 'clips';
                uploadMetaStatus.textContent = `${files.length} ${clipLabel} ready to preview`;
            }

            if (uploadMetaHint) {
                const latestFile = files[files.length - 1];
                if (latestFile?.name) {
                    const truncatedName = latestFile.name.length > 42
                        ? `${latestFile.name.slice(0, 39)}…`
                        : latestFile.name;
                    uploadMetaHint.textContent = files.length === 1
                        ? `Ready: ${truncatedName}`
                        : `${truncatedName} and ${files.length - 1} more`;
                }
            }

            for (const file of files) {
                // eslint-disable-next-line no-await-in-loop
                await showPreview(file);
            }
        });

        uploadButton.addEventListener('click', () => uploadInput.click());

        if (timelineEmptyState) {
            timelineEmptyState.addEventListener('click', () => {
                extendTimelineTrack();
                if (uploadInput) {
                    uploadInput.click();
                }
            });
        }

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
                setPreviewImageVisibility(false);
                previewImage.removeAttribute('src');
                previewVideo.hidden = false;
                previewPlaceholder.hidden = true;

                await new Promise((resolve) => {
                    let resolved = false;
                    let timeoutId = 0;
                    let onEnded = null;
                    let onError = null;
                    const abortController = new AbortController();
                    let playbackStarted = false;

                    const cleanup = () => {
                        if (onEnded) {
                            previewVideo.removeEventListener('ended', onEnded);
                        }
                        if (onError) {
                            previewVideo.removeEventListener('error', onError);
                        }
                        if (!abortController.signal.aborted) {
                            abortController.abort();
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

                    const beginPlayback = async () => {
                        if (playbackStarted) {
                            return;
                        }
                        playbackStarted = true;

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

                        try {
                            await waitForMediaReady(previewVideo, { signal: abortController.signal });
                        } catch (error) {
                            if (abortController.signal.aborted) {
                                return;
                            }
                            console.warn('Preview video was unable to buffer before playback.', error);
                            finalize();
                            return;
                        }

                        try {
                            const playPromise = previewVideo.play();
                            if (playPromise && typeof playPromise.then === 'function') {
                                await playPromise;
                            }
                        } catch (error) {
                            if (abortController.signal.aborted) {
                                return;
                            }
                            console.warn('Preview video failed to start playback.', error);
                            finalize();
                        }
                    };

                    const abortPlayback = () => {
                        finalize();
                    };

                    timelinePlaybackAbort = abortPlayback;

                    onEnded = () => {
                        if (!previewVideo.loop) {
                            finalize();
                        }
                    };

                    onError = () => {
                        finalize();
                    };

                    previewVideo.addEventListener('ended', onEnded);
                    previewVideo.addEventListener('error', onError);

                    const startPlayback = () => {
                        if (resolved) {
                            return;
                        }
                        void beginPlayback();
                    };

                    if (previewVideo.src !== objectURL) {
                        previewVideo.pause();
                        previewVideo.src = objectURL;
                        previewVideo.load();
                        startPlayback();
                    } else if (previewVideo.readyState >= 2) {
                        startPlayback();
                    } else {
                        previewVideo.load();
                        startPlayback();
                    }
                });
            } else if (fileType.startsWith('image/')) {
                setPreviewMode('has-image');
                previewVideo.pause();
                previewVideo.hidden = true;
                previewVideo.removeAttribute('src');
                setPreviewImageVisibility(true);
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
                return false;
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

            return completedNaturally;
        }

        if (exportButton) {
            exportButton.addEventListener('click', () => {
                const timelineItems = getTimelineItems();
                if (!timelineItems.length) {
                    alert('Upload an image or video to build your timeline.');
                    return;
                }

                if (isTimelinePlaying) {
                    stopTimelinePlayback();
                }

                const originalLabel = exportButton.textContent;
                exportButton.disabled = true;
                exportButton.textContent = 'Preparing export…';

                try {
                    const refreshedTimelineItems = getTimelineItems();
                    renderExportSummary(refreshedTimelineItems, null);
                } finally {
                    exportButton.disabled = false;
                    exportButton.textContent = originalLabel || 'Export video';
                }

                openExportDialog();
            });
        }

        if (cancelExportButton) {
            cancelExportButton.addEventListener('click', () => {
                if (isExportingTimeline) {
                    return;
                }
                closeExportDialog();
            });
        }

        function attachPreviewAudioToStream(previewVideo, combinedStream) {
            if (!previewVideo || !combinedStream) {
                return {
                    audioContext: null,
                    success: false,
                    error: new Error('Missing preview video or combined stream.'),
                };
            }

            let lastError = null;

            if (typeof previewVideo.captureStream === 'function') {
                try {
                    const audioStream = previewVideo.captureStream();
                    if (audioStream) {
                        const audioTracks = audioStream.getAudioTracks();
                        audioTracks.forEach((track) => combinedStream.addTrack(track));
                        if (audioTracks.length) {
                            return { audioContext: null, success: true, error: null };
                        }
                    }
                } catch (error) {
                    lastError = error;
                }
            }

            const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextConstructor) {
                return {
                    audioContext: null,
                    success: false,
                    error: lastError || new Error('AudioContext is not supported in this browser.'),
                };
            }

            let audioContext = null;
            try {
                audioContext = new AudioContextConstructor();
                const sourceNode = audioContext.createMediaElementSource(previewVideo);
                const destination = audioContext.createMediaStreamDestination();
                sourceNode.connect(destination);
                sourceNode.connect(audioContext.destination);

                const audioTracks = destination.stream.getAudioTracks();
                audioTracks.forEach((track) => combinedStream.addTrack(track));
                if (!audioTracks.length) {
                    const closeResult = audioContext.close();
                    if (closeResult && typeof closeResult.catch === 'function') {
                        closeResult.catch(() => {});
                    }
                    return {
                        audioContext: null,
                        success: false,
                        error: lastError || new Error('No audio tracks available from preview video.'),
                    };
                }

                return { audioContext, success: true, error: null };
            } catch (error) {
                if (audioContext && typeof audioContext.close === 'function') {
                    const closeResult = audioContext.close();
                    if (closeResult && typeof closeResult.catch === 'function') {
                        closeResult.catch(() => {});
                    }
                }
                return {
                    audioContext: null,
                    success: false,
                    error: error || lastError || new Error('Failed to attach audio from preview video.'),
                };
            }
        }

        async function handleConfirmExport() {
            if (isExportingTimeline) {
                return;
            }

            const timelineItems = getTimelineItems();
            if (!timelineItems.length) {
                alert('Upload an image or video to build your timeline.');
                return;
            }

            if (!window.MediaRecorder) {
                alert('Export is not supported in this browser.');
                return;
            }

            const exportFormat = getSupportedExportFormat();
            if (!exportFormat) {
                alert('Export is not supported by this browser. Try using a browser with MediaRecorder support for MP4 or WebM.');
                return;
            }

            if (!exportMirrorContext) {
                alert('Unable to start export because the rendering context is unavailable.');
                return;
            }

            const resolution = getExportResolution(
                previewAspectSelect?.value,
                videoQualitySelect?.value,
            );

            if (!resolution) {
                alert('Unable to determine export resolution.');
                return;
            }

            isExportingTimeline = true;
            confirmExportButton.disabled = true;
            const originalLabel = confirmExportButton.textContent;
            confirmExportButton.textContent = 'Exporting…';
            if (exportDialogStatus) {
                exportDialogStatus.dataset.state = 'progress';
                exportDialogStatus.innerHTML = `
                    <span class="visually-hidden" role="status">Exporting timeline preview to ${exportFormat.label}…</span>
                    <div class="export-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuetext="Exporting timeline preview" aria-live="off">
                        <div class="export-progress__bar"></div>
                    </div>
                `.trim();
            }

            stopTimelinePlayback();

            let stopMirroring = () => {};
            let recorder = null;
            let combinedStream = null;
            const recordedChunks = [];
            let exportAudioContext = null;

            try {
                stopMirroring = startPreviewMirroring(resolution.width, resolution.height);
                if (typeof exportMirrorCanvas.captureStream !== 'function') {
                    throw new Error('Canvas captureStream is not supported in this browser.');
                }
                const canvasStream = exportMirrorCanvas.captureStream(30);
                if (!canvasStream) {
                    throw new Error('Unable to access canvas capture stream.');
                }
                combinedStream = new MediaStream();
                canvasStream.getVideoTracks().forEach((track) => combinedStream.addTrack(track));

                const audioAttachment = attachPreviewAudioToStream(previewVideo, combinedStream);
                exportAudioContext = audioAttachment.audioContext;
                if (!audioAttachment.success) {
                    console.warn('Unable to capture audio from preview video.', audioAttachment.error);
                }

                recorder = new MediaRecorder(combinedStream, {
                    mimeType: exportFormat.mimeType,
                    videoBitsPerSecond: 6_000_000,
                });

                const recordingPromise = new Promise((resolve, reject) => {
                    recorder.addEventListener('dataavailable', (event) => {
                        if (event.data && event.data.size > 0) {
                            recordedChunks.push(event.data);
                        }
                    });
                    recorder.addEventListener('stop', () => {
                        resolve(new Blob(recordedChunks, { type: exportFormat.mimeType }));
                    }, { once: true });
                    recorder.addEventListener('error', (event) => {
                        reject(event.error || new Error('Recording error.'));
                    }, { once: true });
                });

                recorder.start(250);
                const playbackCompleted = await playTimelineSequence(0);
                if (recorder.state !== 'inactive') {
                    recorder.stop();
                }

                const exportBlob = await recordingPromise;

                if (!playbackCompleted) {
                    throw new Error('Timeline playback was interrupted before completion.');
                }

                const downloadUrl = URL.createObjectURL(exportBlob);
                const tempAnchor = document.createElement('a');
                tempAnchor.href = downloadUrl;
                tempAnchor.download = `timeline-export.${exportFormat.fileExtension}`;
                document.body.appendChild(tempAnchor);
                tempAnchor.click();
                document.body.removeChild(tempAnchor);
                window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);

                if (exportDialogStatus) {
                    exportDialogStatus.textContent = `Export complete! Your ${exportFormat.fileExtension.toUpperCase()} download should begin shortly.`;
                    exportDialogStatus.dataset.state = 'ready';
                }

                closeExportDialog();
            } catch (error) {
                console.error('Failed to export timeline preview.', error);
                alert(`Export failed: ${error?.message || error}`);
                if (exportDialogStatus) {
                    exportDialogStatus.textContent = 'Export failed. Please try again.';
                    exportDialogStatus.dataset.state = 'warning';
                }
            } finally {
                if (recorder && recorder.state !== 'inactive') {
                    try {
                        recorder.stop();
                    } catch (error) {
                        // Ignore
                    }
                }
                if (combinedStream) {
                    combinedStream.getTracks().forEach((track) => track.stop());
                }
                if (exportAudioContext) {
                    try {
                        const closeResult = exportAudioContext.close();
                        if (closeResult && typeof closeResult.catch === 'function') {
                            closeResult.catch(() => {});
                        }
                    } catch (error) {
                        // Ignore
                    }
                    exportAudioContext = null;
                }
                stopMirroring();
                confirmExportButton.disabled = false;
                confirmExportButton.textContent = originalLabel || 'Confirm export';
                isExportingTimeline = false;
            }
        }

        if (confirmExportButton) {
            confirmExportButton.addEventListener('click', () => {
                handleConfirmExport();
            });
        }

        if (exportDialog) {
            exportDialog.addEventListener('click', (event) => {
                if (event.target === exportDialog) {
                    closeExportDialog();
                }
            });
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && isExportDialogOpen()) {
                event.preventDefault();
                closeExportDialog();
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
            playTimelineSequence(startIndex >= 0 ? startIndex : 0).catch((error) => {
                console.error('Timeline playback failed.', error);
            });
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
