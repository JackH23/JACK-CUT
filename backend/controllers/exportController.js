const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { Op } = require("sequelize");
// Shared design units with the responsive editor; no preview pixels are persisted.
const textLayout = require("../../frontend/lib/textLayout.json");

const TimelineItem = require("../models/TimelineItem");
const Media = require("../models/Media");
const ExportJob = require("../models/ExportJob");
const Project = require("../models/Project");
const ProjectMedia = require("../models/ProjectMedia");
const storage = require("../services/storage");
const { fileUrl } = require("../services/fileAccess");
const { getClipAnimationFilters, getClipAnimationWindow } = require("../utils/clipAnimationFilter");
const { getMediaParentTransform } = require("../utils/mediaLayout");
const { getTextAnimationSegments, getTextAnimationTags } = require("../utils/textAnimationAss");
const { getAssFontMetrics } = require("../utils/textFontMetrics");

const { hasAudioStream } = require('../utils/mediaStreams');
const { failureReason, logExportFailure } = require('../utils/exportDiagnostics');

const lifecycle = require('../services/exportLifecycle').createExportLifecycle({ ExportJob, Op, sequelize: Project.sequelize });
const jobs = lifecycle.jobs;
const renderSlots = require('../services/renderSlots').slots;
function hasActiveProjectExport(projectId) {
  return [...jobs.values()].some(job => job.projectId === projectId);
}
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
// Bound per-input decode, filter queues and x264 frame threading on small renderers.
const FFMPEG_THREADS = String(Math.max(1, Math.min(8, Math.floor(Number(process.env.FFMPEG_THREADS) || 1))));
const VIDEO_ENCODER = process.env.FFMPEG_VIDEO_ENCODER || "libx264";

function parseFFmpegTime(value) {
  if (!value) return null;

  const match = String(value).trim().match(
    /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/
  );

  if (!match) return null;

  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3])
  );
}


async function saveExportJob(job) {
  await lifecycle.finish(job);
}

async function findExportJob(id, userId) {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const row = await ExportJob.findByPk(id);
  if (!row || !await Project.findOne({ where: { id: row.project_id, user_id: userId } })) return null;
  // A missing process-map entry cannot prove FFmpeg stopped (restart/another instance).
  // Processing jobs block deletion until explicitly reconciled.
  // PostgreSQL owns durable status; the map contains only active renders.
  return {
    id: row.id, status: row.status, outputReference: row.output_path, error: row.error_message,
    cleanup_reference: row.cleanup_reference, progress: row.progress, completed_at: row.completed_at, metrics: row.metrics || null, stage: row.stage, cancelRequested: row.status === "processing" && Boolean(row.cancel_requested_at)
  };
}

function formatAssTime(seconds) {
  const total = Math.max(0, Number(seconds));

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  const centiseconds = Math.floor((total % 1) * 100);

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function escapeAssText(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\N")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}");
}

function getAssColor(color) {
  const hex = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : textLayout.textColor.slice(1);
  return `&H00${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2)}`.toUpperCase();
}

function getTextStyle(clip, index) {
  const defaults = textLayout.presets[clip.textStyle] ?? textLayout.presets.subtitle;
  const cssFontSize = (clip.fontSize ?? defaults.fontSize) * WIDTH / textLayout.referenceWidth;
  const fontWeight = clip.fontWeight ?? defaults.fontWeight;
  const fontFamily = String(clip.fontFamily ?? textLayout.fontFamily).split(",")[0].replace(/[\r\n]/g, " ").trim() || textLayout.fontFamily;
  const fontSize = cssFontSize * getAssFontMetrics(fontFamily, fontWeight).ratio;
  // Each clip uses its saved font settings. No export-only preset size or outline.
  return `Style: Text${index},${fontFamily},${fontSize},${getAssColor(clip.textColor)},&H000000FF,&H00000000,&H80000000,${fontWeight >= 600 ? -1 : 0},0,0,0,100,100,0,0,1,0,1,5,0,0,0,1`;
}

async function createExport(req, res) {
  let activeJob;

  const stage = "reserve_job";
  try {
    const { projectId } = req.body;

    if (
      typeof projectId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        projectId,
      )
    ) {
      return res.status(400).json({ message: "Valid projectId is required." });
    }

    const id = randomUUID();
    const job = { id, projectId, status: "processing", progress: 0, error: null, createdAt: Date.now(), workerToken: lifecycle.newToken(), stage: "preparing" };
    const reservation = await Project.sequelize.transaction(async transaction => {
      const project = await Project.findOne({ where: { id: projectId, user_id: req.user.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!project) return { status: 404, message: "Project not found." };
      const items = await TimelineItem.findAll({ where: { project_id: projectId }, order: [["start_time", "ASC"]], transaction });
      if (!items.length) return { status: 400, message: "The timeline is empty." };
      const existing = await ExportJob.findOne({ where: { project_id: projectId, status: 'processing' }, transaction });
      if (existing) return { existing };
      await ExportJob.create({ id, project_id: projectId, status: "processing", progress: 0,
        worker_token: job.workerToken, heartbeat_at: new Date(), stage: 'preparing' }, { transaction });
      activeJob = job;

      return { items };
    });
    if (reservation.existing) return res.status(202).json({ id: reservation.existing.id, status: reservation.existing.status, progress: reservation.existing.progress, stage: reservation.existing.stage, cancelRequested: Boolean(reservation.existing.cancel_requested_at) });
    if (!reservation.items) return res.status(reservation.status).json({ message: reservation.message });
    const { items } = reservation;
    lifecycle.register(job);
    res.status(202).json({ id, status: job.status, progress: 0, stage: job.stage, statusUrl: '/api/exports/' + id });
    void renderExport(job, items);
    return;
  } catch (error) {
    if (activeJob) {
      activeJob.status = 'failed'; activeJob.error = 'Could not start export.';
      await saveExportJob(activeJob).catch(() => {});
      lifecycle.release(activeJob);
    }
    logExportFailure({ jobId: activeJob?.id, stage, error });
    return res.status(500).json({ message: 'Could not start export.' });
  }
}

async function renderExport(job, items) {
  const { id, projectId } = job;
  let workDir;
  let stage = 'prepare_sources';
  let handedOff = false;
  let releaseRenderer;
  try {
    await lifecycle.checkpoint(job, 'preparing');

    const mediaIds = [
      ...new Set(
        items
          .filter(
            (item) =>
              item.item_type === "MEDIA" &&
              item.media_id,
          )
          .map((item) => item.media_id),
      ),
    ];
    const mediaFiles = mediaIds.length
      ? await Media.findAll({
        where: {
          id: {
            [Op.in]: mediaIds,
          },
        },
      })
      : [];
    const mediaById = new Map(mediaFiles.map((media) => [media.id, media]));

    stage = "prepare_sources";
    workDir = await storage.workspace();
    const audioStreams = new Map();
    const paths = new Map();
    let nextMedia = 0;
    const concurrency = Math.min(8, Math.max(1, Number(process.env.EXPORT_PREPARE_CONCURRENCY) || 3));
    const prepare = async () => {
      while (nextMedia < mediaFiles.length) {
        const media = mediaFiles[nextMedia++];
        lifecycle.assertRunning(job);
        if (!await ProjectMedia.findOne({ where: { project_id: projectId, media_id: media.id } })) throw new Error('Timeline media is not linked to this project.');
        await lifecycle.checkpoint(job, 'preparing');
        paths.set(media.id, await storage.materialize(media.file_path, workDir, {
          signal: job.abort.signal, onProgress: () => { job.lastWorkAt = Date.now(); },
        }));
        if (media.media_type === 'video') {
          stage = 'probe_streams';
          audioStreams.set(media.id, await hasAudioStream(paths.get(media.id), { signal: job.abort.signal }));
        }
        stage = 'prepare_sources';
      }
    };
    // Wait for every transfer to settle before cleaning the shared scratch directory.
    const prepared = await Promise.allSettled(Array.from({ length: Math.min(concurrency, mediaFiles.length) }, () =>
      prepare().catch(error => { lifecycle.stop(job, job.stopReason || 'Could not prepare source media. Check the media files and renderer tools.'); throw error; })));
    const preparationFailure = prepared.find(result => result.status === 'rejected');
    if (preparationFailure) throw preparationFailure.reason;
    const clips = items.map((item) => {
      console.log("EXPORT TIMELINE ITEM", {
        id: item.id, itemType: item.item_type,
        animationPreset: item.animation_preset,
        animationAmount: item.animation_amount, sourceStart: item.source_start,
      });
      if (item.item_type === "TEXT") {
        return {
          itemType: "TEXT",
          text: item.text_content,
          animationPreset: item.animation_preset ?? 'none',
          animationAmount: item.animation_amount ?? 50,
          animationInPreset: item.animation_in_preset,
          animationInDuration: item.animation_in_duration,
          animationInAmount: item.animation_in_amount,
          animationOutPreset: item.animation_out_preset,
          animationOutDuration: item.animation_out_duration,
          animationOutAmount: item.animation_out_amount,
          textStyle: item.text_style,
          fontSize: item.font_size == null ? null : Number(item.font_size),
          fontWeight: item.font_weight == null ? null : Number(item.font_weight),
          fontFamily: item.font_family,
          textColor: item.text_color,

          textX:
            item.text_x == null
              ? 50
              : Number(item.text_x),

          textY:
            item.text_y == null
              ? 50
              : Number(item.text_y),

          start: Number(item.start_time),
          duration: Number(item.duration),
        };
      }

      const media = mediaById.get(item.media_id);

      if (!media) {
        throw new Error(
          `Media ${item.media_id} was not found.`,
        );
      }

      const clip = {
        itemType: "MEDIA",
        type: media.media_type,
        hasAudio: media.media_type === "audio" || audioStreams.get(media.id) === true,
        filePath: paths.get(media.id),

        start: Number(item.start_time),
        duration: Number(item.duration),

        sourceStart:
          Number(item.source_start ?? 0),

        mediaScale: Number(item.media_scale ?? 1),
        mediaX: Number(item.media_x ?? 0),
        mediaY: Number(item.media_y ?? 0),

        animationInPreset: item.animation_in_preset ?? null,
        animationInDuration: item.animation_in_duration ?? null,
        animationInAmount: item.animation_in_amount ?? null,
        animationOutPreset: item.animation_out_preset ?? null,
        animationOutDuration: item.animation_out_duration ?? null,
        animationOutAmount: item.animation_out_amount ?? null,
        animationPreset:
          item.animation_preset ?? "none",

        animationAmount:
          item.animation_amount == null
            ? 50
            : Number(item.animation_amount),
      };
      console.log("EXPORT CLIP", { id: item.id, type: clip.type, hasAudio: clip.hasAudio, mediaScale: clip.mediaScale, mediaX: clip.mediaX, mediaY: clip.mediaY, sourceStart: clip.sourceStart });
      return clip;
    });

    for (const clip of clips) {
      if (
        clip.itemType === "MEDIA" &&
        !fs.existsSync(clip.filePath)
      ) {
        throw new Error(
          `Media file is missing: ${clip.filePath}`,
        );
      }
    }

    const totalDuration = Math.max(
      ...clips.map((clip) => clip.start + clip.duration),
    );

    if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
      job.status = "failed"; job.error = "Invalid timeline duration.";
      await saveExportJob(job);
      await cleanupExportWorkspace(job, workDir, true);
      lifecycle.release(job);
      return;
    }

    const OUTPUT_DIR = workDir;
    const ASS_DIR = workDir;

    const outputPath = path.join(OUTPUT_DIR, `${id}.mp4`);
    job.outputPath = outputPath;

    const args = [
      "-y",
      "-filter_complex_threads", FFMPEG_THREADS,
      "-filter_threads", FFMPEG_THREADS,
      "-progress",
      "pipe:1",
      "-nostats",
      "-f",
      "lavfi",
      "-i",
      `color=c=black:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=${totalDuration}`,
      "-f",
      "lavfi",
      "-i",
      `anullsrc=r=48000:cl=stereo:d=${totalDuration}`,
    ];

    // Inputs 0 and 1 are the black background and silent audio.
    const mediaClips = clips.filter(
      (clip) => clip.itemType === "MEDIA",
    );

    mediaClips.forEach((clip) => {
      args.push("-threads", FFMPEG_THREADS);
      if (clip.type === "image") {
        args.push(
          "-framerate",
          String(FPS),
        );
      } else {
        // Decode through the source offset, then trim both streams below.
        args.push(
          "-t",
          String(clip.sourceStart + clip.duration),
        );
      }

      args.push("-i", clip.filePath);
    });

    stage = "build_filter_graph";
    const filters = [];
    let currentVideo = "0:v";
    const audioLabels = ["1:a"];

    // Process MEDIA inputs.
    // FFmpeg input 0 = black background
    // FFmpeg input 1 = silent audio
    // Media inputs therefore begin at index 2.
    mediaClips.forEach((clip, index) => {
      const inputIndex = index + 2;

      if (clip.type === "image" || clip.type === "video") {
        const prepared = `visual${index}`;
        const composed = `composed${index}`;
        const sourceStart = clip.type === "video" ? clip.sourceStart : 0;
        const base = getMediaParentTransform(clip, WIDTH, HEIGHT);
        const animationFilters = getClipAnimationFilters(clip, { width: WIDTH, height: HEIGHT });
        const localWindow = getClipAnimationWindow(clip);
        const timelineWindow = localWindow.replace(/\bt\b/g, `(t-${clip.start})`);
        const active = `between(t,${clip.start},${clip.start + clip.duration})`;
        const visualFilters = [
          `trim=start=${sourceStart}:duration=${clip.duration}`,
          "setpts=PTS-STARTPTS",
          `fps=${FPS}`,
        ];
        // Fast static branch outside animation windows. Animations sample the
        // uncut source using the composed base+animation inverse map, so a
        // small/moved parent cannot clip a slide or zoom before final composition.
        const animatedInput = `animationInput${index}`;
        const baseInput = `baseInput${index}`;
        if (animationFilters.length) {
          filters.push(`[${inputIndex}:v]${visualFilters.join(",")},split=2[${baseInput}][${animatedInput}]`);
        } else {
          filters.push(`[${inputIndex}:v]${visualFilters.join(",")}[${baseInput}]`);
        }
        const baseFilters = [`scale=${Math.round(base.width)}:${Math.round(base.height)}:force_original_aspect_ratio=decrease`, "format=yuva444p"];
        if (clip.type === "image") baseFilters.push("loop=loop=-1:size=1:start=0", `trim=duration=${clip.duration}`);
        baseFilters.push("setsar=1", `setpts=PTS+${clip.start}/TB`);
        filters.push(`[${baseInput}]${baseFilters.join(",")}[${prepared}]`);
        filters.push(`[${currentVideo}][${prepared}]overlay=x='${base.centerX}-overlay_w/2':y='${base.centerY}-overlay_h/2':format=auto:eof_action=pass:shortest=0:enable='${active}${animationFilters.length ? `*not(${timelineWindow})` : ""}'[${composed}]`);
        currentVideo = composed;
        if (animationFilters.length) {
          const animated = `animated${index}`, result = `animatedComposed${index}`;
          const normalizedAnimation = [`scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease`, "format=yuva444p", `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black@0`, "setsar=1", ...animationFilters];
          if (clip.type === "image") normalizedAnimation.splice(4, 0, "loop=loop=-1:size=1:start=0", `trim=duration=${clip.duration}`);
          // Keep full-chroma fractional positioning through composition. Early 4:2:0
          // overlays round odd coordinates and change chroma at moving edges.
          filters.push(`[${animatedInput}]${normalizedAnimation.join(",")},setpts=PTS+${clip.start}/TB[${animated}]`);
          filters.push(`[${currentVideo}][${animated}]overlay=format=auto:eof_action=pass:shortest=0:enable='${active}*(${timelineWindow})'[${result}]`);
          currentVideo = result;
        }
        console.log("EXPORT MEDIA GEOMETRY", { index, base, animationFilters, localWindow });
      }

      if (clip.hasAudio) {
        const audioLabel = `audio${index}`;
        const delayMs = Math.round(clip.start * 1000);

        filters.push(
          `[${inputIndex}:a]` +
          `atrim=start=${clip.sourceStart}:duration=${clip.duration},` +
          `asetpts=PTS-STARTPTS,` +
          `adelay=${delayMs}|${delayMs}` +
          `[${audioLabel}]`,
        );

        audioLabels.push(audioLabel);
      }
    });

    const textClips = clips.filter(
      (clip) => clip.itemType === "TEXT",
    );

    let assPath = null;

    if (textClips.length > 0) {
      assPath = path.join(ASS_DIR, `${id}.ass`);

      const styles = textClips.map(getTextStyle).join("\n");
      const events = textClips
        .map((clip, index) => {
          const style = `Text${index}`;
          const fontWeight = clip.fontWeight ?? (textLayout.presets[clip.textStyle] ?? textLayout.presets.subtitle).fontWeight;
          const text = escapeAssText(clip.text);
          return getTextAnimationSegments(clip, FPS).map(segment => {
            const position = segment.animated
              ? getTextAnimationTags(clip, segment.state, WIDTH, HEIGHT)
              : `\\pos(${Math.round(clip.textX / 100 * WIDTH)},${Math.round(clip.textY / 100 * HEIGHT)})`;
            const positionedText = `{\\an5\\q2\\b${getAssFontMetrics(clip.fontFamily ?? textLayout.fontFamily, fontWeight).weight}${position}}${text}`;
            // libass evaluates integer milliseconds. Put sampled-frame event
            // boundaries in the preceding centisecond so rounding of an exact
            // frame timestamp cannot retain the previous sample for one frame.
            const tick = segment.animated ? 1e-6 : 0;
            return `Dialogue: 0,${formatAssTime(segment.start - tick)},${formatAssTime(segment.end - tick)},${style},,0,0,0,,${positionedText}`;
          }).join("\n");
        })
        .join("\n");

      const assContent = `[Script Info]
    ScriptType: v4.00+
    PlayResX: ${WIDTH}
    PlayResY: ${HEIGHT}
    WrapStyle: 2
    ScaledBorderAndShadow: yes

    [V4+ Styles]
    Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
    ${styles}

    [Events]
    Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
    ${events}
    `;

      fs.writeFileSync(assPath, assContent, "utf8");
    }

    if (assPath) {
      const escapedAssPath = assPath
        .replace(/\\/g, "/")
        .replace(/:/g, "\\:");

      const textVideo = "textOverlay";

      filters.push(
        `[${currentVideo}]` +
        `ass='${escapedAssPath}'` +
        `[${textVideo}]`,
      );

      currentVideo = textVideo;
    }

    filters.push(
      `${audioLabels.map((label) => `[${label}]`).join("")}` +
      `amix=inputs=${audioLabels.length}:duration=longest:normalize=0,` +
      `atrim=duration=${totalDuration}[outa]`,
    );

    const filterGraph = filters.join(";");
    console.log("Export render prepared", { jobId: id, encoder: VIDEO_ENCODER, clipCount: clips.length, duration: totalDuration });

    args.push(
      "-filter_complex",
      filterGraph,
      "-map",
      currentVideo === "0:v" ? currentVideo : `[${currentVideo}]`,
      "-map",
      "[outa]",
      "-t",
      String(totalDuration),

      "-c:v",
      VIDEO_ENCODER,
      "-threads", FFMPEG_THREADS,
      ...(VIDEO_ENCODER === "h264_amf"
        ? ["-quality", "balanced"]
        : VIDEO_ENCODER === "libx264"
          ? ["-preset", process.env.FFMPEG_PRESET || "medium", "-crf", "23"]
          : []),
      "-pix_fmt",
      "yuv420p",

      "-r",
      String(FPS),

      "-c:a",
      "aac",

      "-movflags",
      "+faststart",

      outputPath,
    );

    stage = "spawn_ffmpeg";
    await lifecycle.checkpoint(job, "starting");
    job.waitingForRenderer = true;
    const rendererWaitStarted = Date.now(); lifecycle.trace('renderer_wait', job);
    try {
      releaseRenderer = await renderSlots.acquire(job.abort.signal);
      lifecycle.trace('renderer_acquired', job, { durationMs: Date.now() - rendererWaitStarted });
    }
    finally { job.waitingForRenderer = false; job.lastWorkAt = Date.now(); }
    await lifecycle.withStartLock(job, () => {
      const renderStarted = Date.now();
      const child = spawn(process.env.FFMPEG_PATH || "ffmpeg", args, { windowsHide: true });

      job.child = child;
      child.once('spawn', () => { job.stage = 'rendering'; job.lastWorkAt = Date.now(); lifecycle.trace('ffmpeg_spawned', job); });

      let progressBuffer = "";

      // Track PostgreSQL progress updates
      let lastSavedProgress = 0;
      let lastSavedAt = Date.now();
      let progressSaveQueue = Promise.resolve();


      child.stdout.on("data", (chunk) => {
        progressBuffer += chunk.toString();

        const lines = progressBuffer.split(/\r?\n/);
        progressBuffer = lines.pop() || "";

        for (const line of lines) {
          const separator = line.indexOf("=");

          if (separator === -1) continue;

          const key = line.slice(0, separator);
          const value = line.slice(separator + 1);

          if (!["out_time", "out_time_us"].includes(key)) continue;

          const seconds = key === "out_time_us" ? Number(value) / 1e6 : parseFFmpegTime(value);

          if (!Number.isFinite(seconds) || seconds === null || totalDuration <= 0) {
            continue;
          }

          const percentage = Math.min(
            99,
            Math.max(
              0,
              Math.floor((seconds / totalDuration) * 95)
            )
          );

          if (seconds > (job.lastOutputSeconds || 0)) { job.lastWorkAt = Date.now(); job.lastOutputSeconds = seconds; }
          job.progress = Math.max(
            job.progress,
            percentage
          );

          // Save progress to PostgreSQL
          if (
            job.progress > lastSavedProgress &&
            (
              job.progress - lastSavedProgress >= 5 ||
              Date.now() - lastSavedAt >= 1000
            )
          ) {
            const progressToSave = job.progress;

            lastSavedProgress = progressToSave;
            lastSavedAt = Date.now();

            job.pendingProgressWrites = (job.pendingProgressWrites || 0) + 1;
            progressSaveQueue = progressSaveQueue
              .then(async () => {
                const started = Date.now(); job.progressWriteStartedAt = started;
                lifecycle.trace('progress_write_begin', job, { pendingProgressWrites: job.pendingProgressWrites });
                try {
                  const [affectedRows] = await ExportJob.update({ progress: progressToSave },
                    { where: { id, status: 'processing', worker_token: job.workerToken, cancel_requested_at: null } });
                  lifecycle.trace('progress_write_end', job, { affectedRows, durationMs: Date.now() - started });
                } catch (error) {
                  lifecycle.trace('progress_write_failed', job, { error, durationMs: Date.now() - started });
                } finally { job.pendingProgressWrites--; job.progressWriteStartedAt = null; }
              });
          }
        }
      });

      let stderr = "";

      child.stderr.on("data", (chunk) => {
        stderr = (stderr + chunk.toString()).slice(-4000);
      });

      let settled = false;
      const finish = async (code, spawnError, signal) => {
        let finishStage = "render";
        if (settled) return;
        settled = true;
        job.finishing = true;

        try {
          // Wait for pending PostgreSQL progress updates
          const progressWaitStarted = Date.now(); job.finalizationPhase = 'progress_wait';
          lifecycle.trace('progress_wait_begin', job, { pendingProgressWrites: job.pendingProgressWrites || 0 });
          if (!job.abort.signal.aborted) {
            // Progress writes are fenced. A stuck write must not block cancel's
            // terminal status after the child has closed.
            let stopWaiting;
            const stopped = new Promise(resolve => {
              stopWaiting = resolve;
              job.abort.signal.addEventListener('abort', stopWaiting, { once: true });
            });
            try { await Promise.race([progressSaveQueue, stopped]); }
            finally { job.abort.signal.removeEventListener('abort', stopWaiting); }
          }

          lifecycle.trace('progress_wait_end', job, { durationMs: Date.now() - progressWaitStarted, pendingProgressWrites: job.pendingProgressWrites || 0 });
          job.finalizationPhase = null;
          const renderSeconds =
            (Date.now() - renderStarted) / 1000;
          const frames = [...stderr.matchAll(/frame=\s*(\d+)/g)].at(-1)?.[1];
          job.metrics = { renderSeconds, totalSeconds: (Date.now() - job.createdAt) / 1000, fps: frames && renderSeconds > 0 ? Number(frames) / renderSeconds : null, speed: renderSeconds > 0 ? totalDuration / renderSeconds : null };
          if (job.cancelRequested) {
            job.status = "cancelled";
            job.error = null;

            await saveExportJob(job);
            return;
          }

          lifecycle.assertRunning(job);
          if (spawnError || code !== 0) {
            throw new Error("FFmpeg rendering failed.");
          }

          finishStage = "persist_output";
          job.progress = 95;
          await lifecycle.checkpoint(job, 'uploading');
          job.outputReference = storage.referenceFor('exports/' + id + '.mp4');
          await ExportJob.update({ cleanup_reference: job.outputReference }, { where: { id, status: 'processing', worker_token: job.workerToken } });
          lifecycle.assertRunning(job);
          job.outputReference = await storage.persist(
            outputPath,
            `exports/${id}.mp4`,
            "video/mp4",
            { signal: job.abort.signal, onProgress: () => { job.lastWorkAt = Date.now(); } },
          );
          await lifecycle.checkpoint(job);

          finishStage = "save_completed_status";
          job.status = "completed";

          await saveExportJob(job);
        } catch (error) {
          logExportFailure({ jobId: id, stage: finishStage, error: spawnError || error, exitCode: code, signal, reason: finishStage === "render" ? failureReason(stderr, spawnError) : undefined });

          // Retrying cancellation persistence must not change its outcome to failure.
          job.status = job.cancelRequested ? "cancelled" : "failed";
          job.error = job.cancelRequested
            ? null
            : job.stopReason || exportErrorMessage(finishStage, stderr, spawnError || error);

          try {
            await saveExportJob(job);
          } catch {
            console.error("Could not persist failed export status.");
          }
        } finally {
          await discardUnpublishedOutput(job);
          await cleanupExportWorkspace(job, workDir);
          lifecycle.release(job);
        }
      };
      child.once('error', error => { job.spawnError = error; lifecycle.trace('ffmpeg_error', job, { error }); });
      child.once('exit', (exitCode, signal) => { lifecycle.trace('ffmpeg_exit', job, { exitCode, signal }); });
      child.once('close', (code, signal) => {
        job.childClosed = true; lifecycle.trace('ffmpeg_close', job, { exitCode: code, signal });
        releaseRenderer?.(); releaseRenderer = null; lifecycle.trace('renderer_released', job);
        void finish(code, job.spawnError, signal);
      });
      handedOff = true;
    });

    return;
  } catch (error) {
    if (!handedOff) {
      if (releaseRenderer) { releaseRenderer(); lifecycle.trace('renderer_released', job); }
      job.status = job.cancelRequested ? 'cancelled' : 'failed';
      job.error = job.cancelRequested ? null : job.stopReason || exportErrorMessage(stage, '', error);
      await saveExportJob(job).catch(() => console.error('Could not persist export failure. Lease recovery will retry.'));
      await discardUnpublishedOutput(job);
      await cleanupExportWorkspace(job, workDir);
      lifecycle.release(job);
    }
    logExportFailure({ jobId: id, stage, error });
  }
}



function exportErrorMessage(stage, stderr, error) {
  if (stage === 'persist_output') return 'Could not upload the MP4. Check storage availability and try again.';
  if (stage === 'save_completed_status') return 'Could not save export status. Please try again.';
  if (stage === 'probe_streams') return error?.code === 'ENOENT' ? 'The media inspection tool is unavailable. Contact support.' : 'Could not inspect source media. Check the media file and try again.';
  if (stage === 'prepare_sources') return 'Could not load source media. Check that all timeline files are available.';
  const reason = failureReason(stderr, error?.code ? error : null);
  return ({ ffmpeg_binary_missing: 'The video renderer is unavailable. Contact support.', missing_input_stream: 'A source media stream is missing. Check the media files.',
    encoder_unavailable: 'The configured video encoder is unavailable. Contact support.', subtitle_filter_unavailable: 'The subtitle renderer is unavailable. Contact support.',
    memory_exhausted: 'The renderer ran out of memory. Try a shorter timeline.', scratch_disk_full: 'The renderer ran out of temporary disk space. Contact support.' })[reason] || 'Video rendering failed. Check source media or try a shorter timeline.';
}
async function cleanupExportWorkspace(job, workDir, failOnError = false) {
  const started = Date.now(); job.finalizationPhase = 'cleanup';
  lifecycle.trace('cleanup_begin', job);
  try { await storage.cleanup(workDir); lifecycle.trace('cleanup_end', job, { durationMs: Date.now() - started }); }
  catch (error) { lifecycle.trace('cleanup_failed', job, { error, durationMs: Date.now() - started }); console.error('Render temporary cleanup failed.'); if (failOnError) throw error; }
  finally { job.finalizationPhase = null; }
}
async function discardUnpublishedOutput(job) {
  if (!job.outputReference || job.status === 'completed') return;
  const started = Date.now(); lifecycle.trace('unpublished_cleanup_begin', job);
  try {
    const row = await ExportJob.findByPk(job.id);
    if (row?.status === 'completed') { lifecycle.trace('unpublished_cleanup_end', job, { durationMs: Date.now() - started }); return; }
    await ExportJob.update({ cleanup_reference: job.outputReference }, { where: { id: job.id, status: { [Op.in]: ['failed', 'cancelled'] } }, silent: true });
    await storage.remove(job.outputReference);
    await ExportJob.update({ cleanup_reference: null }, { where: { id: job.id }, silent: true });
    lifecycle.trace('unpublished_cleanup_end', job, { durationMs: Date.now() - started });
  } catch (error) { lifecycle.trace('unpublished_cleanup_failed', job, { error, durationMs: Date.now() - started }); console.error('Unpublished export output retained for cleanup recovery.'); }
}

async function getExport(req, res) {
  try {
    const job = await findExportJob(
      req.params.id,
      req.user.id,
    );

    if (!job) {
      return res.status(404).json({
        message: "Export not found.",
      });
    }

    const activeJob = jobs.get(job.id);
    const cleanup = require("../services/exportCleanupService")
      .getService();

    const progress =
      job.status === "completed"
        ? 100
        : job.status === "processing"
          ? Math.max(
              Number(job.progress) || 0,
              Number(activeJob?.progress) || 0,
            )
          : Number(job.progress) || 0;

    const downloadAvailable = cleanup.available(job);

    return res.json({
      id: job.id,
      status: job.status,
      progress,
      error: job.error,
      metrics: job.metrics,
      stage: job.cancelRequested ? "cancelling" : job.stage,
      cancelRequested: job.cancelRequested,
      downloadAvailable,
      expiresAt: job.completed_at
        ? new Date(
            new Date(job.completed_at).getTime() +
              cleanup.retentionMs,
          ).toISOString()
        : null,
      downloadUrl: downloadAvailable
        ? fileUrl(req, "export", job.id)
        : null,
    });
  } catch (error) {
    logExportFailure({ jobId: req.params.id, stage: "load_status", error });

    return res.status(500).json({
      message: "Could not load export.",
    });
  }
}


async function cancelExport(req, res) {
  try {
    const job = await findExportJob(
      req.params.id,
      req.user.id,
    );

    if (!job) {
      return res.status(404).json({
        message: "Export not found.",
      });
    }

    if (job.status === 'processing') await lifecycle.requestCancel(job.id);
    // Return authoritative status/download metadata even if completion won.
    // Repeated requests on terminal jobs are idempotent, not HTTP 409 errors.
    const current = await findExportJob(job.id, req.user.id);
    if (!current) return res.status(404).json({ message: 'Export not found.' });
    res.status(current.status === 'processing' ? 202 : 200);
    return getExport(req, res);
  } catch (error) {
    logExportFailure({ jobId: req.params.id, stage: "cancel", error });

    return res.status(500).json({
      message: "Could not cancel export.",
    });
  }
}

async function downloadExport(req, res) {
  try {
    const job = await findExportJob(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ message: "Export not found." });
    if (job.status !== "completed") return res.status(409).json({ message: "Export is not ready." });
    const cleanup = require('../services/exportCleanupService').getService();
    return await cleanup.withDownload(job.id, async row => {
      if (res.destroyed || res.writableFinished) return;
      if (!row || !cleanup.available(row)) return res.status(410).json({ code: 'EXPORT_EXPIRED', message: 'This export download has expired or is unavailable. Please export the project again.' });
      let release;
      const finished = new Promise(resolve => { release = resolve; });
      res.once('finish', release);
      res.once('close', release);
      try {
        await storage.serve(row.output_path, req, res, { downloadName: 'jackcut-' + job.id + '.mp4' });
        await finished;
      } finally {
        res.off('finish', release);
        res.off('close', release);
      }
    });
  } catch { if (!res.headersSent) return res.status(500).json({ message: "Could not download export." }); }
}

module.exports = {
  startExportRecovery: lifecycle.start,
  hasActiveProjectExport,
  createExport,
  getExport,
  cancelExport,
  downloadExport,
};