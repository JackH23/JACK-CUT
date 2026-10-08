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

const jobs = new Map();
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
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
  await ExportJob.update(
    {
      status: job.status,
      progress: job.progress ?? 0,
      output_path: job.outputReference || null,
      error_message: job.error,
      metrics: job.metrics || null,
      completed_at:
        job.status === "processing" ? null : new Date(),
    },
    {
      where: { id: job.id },
    }
  );
}

async function findExportJob(id, userId) {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const row = await ExportJob.findByPk(id);
  if (!row || !await Project.findOne({ where: { id: row.project_id, user_id: userId } })) return null;
  if (row.status === "processing" && !jobs.has(id)) {
    row.status = "failed";
    row.error_message = "Export interrupted by a backend restart. Please export again.";
    await ExportJob.update({ status: row.status, error_message: row.error_message, completed_at: new Date() }, { where: { id, status: "processing" } });
  }
  // PostgreSQL owns durable status; the map contains only active renders.
  return {
    id: row.id, status: row.status, outputReference: row.output_path, error: row.error_message,
    cleanup_reference: row.cleanup_reference, progress: row.progress, completed_at: row.completed_at, metrics: row.metrics || null
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
  let workDir;
  let activeJob;
  let handedOff = false;
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

    const items = await TimelineItem.findAll({
      where: { project_id: projectId },
      order: [["start_time", "ASC"]],
    });

    if (items.length === 0) {
      return res.status(400).json({ message: "The timeline is empty." });
    }

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

    workDir = await storage.workspace();
    const paths = new Map();
    for (const media of mediaFiles) {
      if (!await ProjectMedia.findOne({ where: { project_id: projectId, media_id: media.id } })) throw new Error("Timeline media is not linked to this project.");
      paths.set(media.id, await storage.materialize(media.file_path, workDir));
    }
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
      console.log("EXPORT CLIP", { id: item.id, ...clip });
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
      await storage.cleanup(workDir);
      return res.status(400).json({ message: "Invalid timeline duration." });
    }

    const OUTPUT_DIR = workDir;
    const ASS_DIR = workDir;

    const id = randomUUID();
    const outputPath = path.join(OUTPUT_DIR, `${id}.mp4`);
    const job = {
      id,
      status: "processing",
      progress: 0,
      outputPath,
      error: null,
      createdAt: Date.now(),
    };
    activeJob = job;
    await ExportJob.create({
      id,
      project_id: projectId,
      status: "processing",
      progress: 0,
    });
    jobs.set(id, job);

    const args = [
      "-y",
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
      if (clip.type === "image") {
        args.push(
          "-loop",
          "1",
          "-t",
          String(clip.duration),
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
        baseFilters.push("setsar=1", `setpts=PTS+${clip.start}/TB`);
        filters.push(`[${baseInput}]${baseFilters.join(",")}[${prepared}]`);
        filters.push(`[${currentVideo}][${prepared}]overlay=x='${base.centerX}-overlay_w/2':y='${base.centerY}-overlay_h/2':format=auto:eof_action=pass:shortest=0:enable='${active}${animationFilters.length ? `*not(${timelineWindow})` : ""}'[${composed}]`);
        currentVideo = composed;
        if (animationFilters.length) {
          const animated = `animated${index}`, result = `animatedComposed${index}`;
          const normalizedAnimation = [`scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease`, "format=yuva444p", `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black@0`, "setsar=1", ...animationFilters];
          filters.push(`[${animatedInput}]${normalizedAnimation.join(",")},setpts=PTS+${clip.start}/TB[${animated}]`);
          filters.push(`[${currentVideo}][${animated}]overlay=format=auto:eof_action=pass:shortest=0:enable='${active}*(${timelineWindow})'[${result}]`);
          currentVideo = result;
        }
        console.log("EXPORT MEDIA GEOMETRY", { index, base, animationFilters, localWindow });
      }

      if (clip.type === "audio" || clip.type === "video") {
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
    console.log("FFMPEG FILTER GRAPH:", filterGraph);
    console.log("FFMPEG OUTPUT:", { id, outputPath });

    args.push(
      "-filter_complex",
      filterGraph,
      "-map",
      `[${currentVideo}]`,
      "-map",
      "[outa]",
      "-t",
      String(totalDuration),

      "-c:v",
      VIDEO_ENCODER,
      ...(VIDEO_ENCODER === "h264_amf"
        ? ["-quality", "balanced"]
        : VIDEO_ENCODER === "libx264"
          ? ["-preset", "medium", "-crf", "23"]
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

    const renderStarted = Date.now();
    const child = spawn(process.env.FFMPEG_PATH || "ffmpeg", args);


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

        if (key !== "out_time") continue;

        const seconds = parseFFmpegTime(value);

        if (seconds === null || totalDuration <= 0) {
          continue;
        }

        const percentage = Math.min(
          99,
          Math.max(
            0,
            Math.floor((seconds / totalDuration) * 100)
          )
        );

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

          progressSaveQueue = progressSaveQueue
            .then(() =>
              ExportJob.update(
                { progress: progressToSave },
                {
                  where: {
                    id,
                    status: "processing",
                  },
                }
              )
            )
            .catch((error) => {
              console.error(
                "Failed to save export progress:",
                error
              );
            });
        }
      }
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });

    let settled = false;
    const finish = async (code, spawnError) => {
      if (settled) return;
      settled = true;

      try {
        // Wait for pending PostgreSQL progress updates
        await progressSaveQueue;

        const renderSeconds =
          (Date.now() - renderStarted) / 1000;
        const frames = [...stderr.matchAll(/frame=\s*(\d+)/g)].at(-1)?.[1];
        job.metrics = { renderSeconds, totalSeconds: (Date.now() - job.createdAt) / 1000, fps: frames && renderSeconds > 0 ? Number(frames) / renderSeconds : null, speed: renderSeconds > 0 ? totalDuration / renderSeconds : null };
        if (spawnError || code !== 0) throw new Error("FFmpeg rendering failed.");
        job.outputReference = await storage.persist(
          outputPath,
          "exports/" + id + ".mp4",
          "video/mp4"
        );

        job.progress = 100;
        job.status = "completed";

        await saveExportJob(job);
      } catch {
        // Retain a completed object if saving metadata fails: a lost DB acknowledgement
        // must never trigger deletion of an object that may already be referenced.
        job.status = "failed";
        job.error = "Could not complete export. Check FFmpeg, storage and database availability.";
        try { await saveExportJob(job); } catch { console.error("Could not persist failed export status."); }
      } finally {
        jobs.delete(id);
        await storage.cleanup(workDir).catch(() => console.error("Render temporary cleanup failed."));
      }
    };
    child.once("error", error => { job.spawnError = error; });
    child.once("close", code => { void finish(code, job.spawnError); });
    handedOff = true;

    return res.status(202).json({
      id,
      status: job.status,
      progress: job.progress,
      statusUrl: `/api/exports/${id}`,
    });
  } catch (error) {
    if (!handedOff) {
      await storage.cleanup(workDir).catch(() => console.error("Render temporary cleanup failed."));
      if (activeJob) { activeJob.status = "failed"; activeJob.error = "Could not start export."; await saveExportJob(activeJob).catch(() => { }); jobs.delete(activeJob.id); }
    }
    console.error("Could not start export.");
    return res.status(500).json({ message: "Could not start export." });
  }
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
    console.error("Could not load export:", error);

    return res.status(500).json({
      message: "Could not load export.",
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
module.exports = { createExport, getExport, downloadExport };
