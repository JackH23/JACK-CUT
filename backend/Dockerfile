# Build from the repository root: docker build -f backend/Dockerfile -t jackcut-backend .
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:24-bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg fontconfig fonts-liberation2 fonts-dejavu-core fonts-noto-core fonts-inter \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY --from=dependencies /app/backend/node_modules ./node_modules
# Root .dockerignore allows only backend runtime sources, never .env or local media.
COPY backend/ ./
# Shared preview/export math; no frontend application or frontend dependencies.
COPY frontend/lib/textLayout.json frontend/lib/mediaAnimation.js frontend/lib/textAnimation.js /app/frontend/lib/
RUN fc-cache -f \
    && mkdir -p /tmp/jackcut \
    && chown node:node /tmp/jackcut
ENV NODE_ENV=production \
    STORAGE_DRIVER=r2 \
    FFMPEG_VIDEO_ENCODER=libx264 \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe \
    TEMP_STORAGE_DIR=/tmp/jackcut
USER node
# Fail an image build if the selected encoder, ASS filter, shared files or scratch are missing.
RUN ["node","-e","const {execFileSync}=require('node:child_process'); const fs=require('node:fs'); const assert=require('node:assert/strict'); execFileSync(process.env.FFPROBE_PATH,['-version']); const filters=execFileSync(process.env.FFMPEG_PATH,['-hide_banner','-filters'],{encoding:'utf8'}); assert.match(filters,/\\bass\\s+V->V/); const ass=process.env.TEMP_STORAGE_DIR+'/build-check.ass'; fs.writeFileSync(ass,'[Script Info]\\nScriptType: v4.00+\\nPlayResX: 64\\nPlayResY: 64\\n[V4+ Styles]\\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\\nStyle: Default,Arial,12,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,0,0,0,1\\n[Events]\\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\\nDialogue: 0,0:00:00.00,0:00:00.10,Default,,0,0,0,,JackCut\\n'); try { execFileSync(process.env.FFMPEG_PATH,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=64x64:d=0.1','-vf','ass='+ass,'-c:v','libx264','-f','null','-']); } finally { fs.unlinkSync(ass); } for(const name of ['textLayout.json','mediaAnimation.js','textAnimation.js'])require('../frontend/lib/'+name); const {getAssFontMetrics}=require('./utils/textFontMetrics'); assert(getAssFontMetrics('Arial',400).ratio>1); assert(getAssFontMetrics('Inter',400).ratio>1); assert(fs.existsSync('scripts/exportCleanup.js')); assert(!fs.existsSync('.env'));"]
EXPOSE 5001
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||5001)+'/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
