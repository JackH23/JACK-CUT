const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { Op } = require("sequelize");
// Shared design units with the responsive editor; no preview pixels are persisted.
const textLayout = require("../../frontend/lib/textLayout.json");

const TimelineItem = require("../models/TimelineItem");
const Media = require("../models/Media");
const { getClipAnimationFilters, getClipAnimationWindow } = require("../utils/clipAnimationFilter");
const { getMediaParentTransform } = require("../utils/mediaLayout");
const { getTextAnimationSegments, getTextAnimationTags } = require("../utils/textAnimationAss");
const { getAssFontMetrics } = require("../utils/textFontMetrics");

const jobs = new Map();
const ASS_DIR = path.resolve(process.cwd(), "exports", "subtitles");
const OUTPUT_DIR = path.resolve(process.cwd(), "exports");
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;

// Persist only job metadata. A partial MP4 never implies completion.
function saveExportJob(job) {
  const filename = path.join(OUTPUT_DIR, job.id + ".job.json");
  try {
    fs.writeFileSync(filename + ".tmp", JSON.stringify({
      id: job.id, status: job.status, error: job.error, metrics: job.metrics,
    }));
    fs.renameSync(filename + ".tmp", filename);
  } catch (error) {
    console.error("Could not persist export job:", job.id, error);
  }
}

function findExportJob(id) {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  if (jobs.has(id)) return jobs.get(id);
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, id + ".job.json"), "utf8"));
    if (saved.id !== id || !["processing", "completed", "failed"].includes(saved.status)) return null;
    const job = { id, status: saved.status, error: saved.error ?? null, metrics: saved.metrics ?? null, outputPath: path.join(OUTPUT_DIR, id + ".mp4") };
    if (job.status === "processing") {
      job.status = "failed";
      job.error = "Export interrupted by a backend restart. Please export again.";
      saveExportJob(job);
    } else if (job.status === "completed" && !fs.existsSync(job.outputPath)) {
      job.status = "failed";
      job.error = "The exported video file is missing. Please export again.";
    }
    jobs.set(id, job);
    return job;
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Could not read export job:", id, error);
    return null;
  }
}

function getLocalMediaPath(fileUrl) {
  if (typeof fileUrl !== "string" || !fileUrl.startsWith("/uploads/media/")) {
    throw new Error(`Invalid media path: ${fileUrl}`);
  }

  const uploadsDir = path.resolve(process.cwd(), "uploads", "media");
  const filename = path.basename(fileUrl);
  const filePath = path.resolve(uploadsDir, filename);

  if (!filePath.startsWith(`${uploadsDir}${path.sep}`)) {
    throw new Error("Invalid media path.");
  }

  return filePath;
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
        filePath: getLocalMediaPath(
          media.file_url,
        ),

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
      return res.status(400).json({ message: "Invalid timeline duration." });
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.mkdirSync(ASS_DIR, { recursive: true });

    const id = randomUUID();
    const outputPath = path.join(OUTPUT_DIR, `${id}.mp4`);
    const job = { id, status: "processing", outputPath, error: null, createdAt: Date.now() };
    jobs.set(id, job);
    saveExportJob(job);

    const args = [
      "-y",
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
      "h264_amf",
      "-quality",
      "balanced",
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
    const process = spawn("ffmpeg", args);
    let stderr = "";

    process.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });

    process.on("error", (error) => {
      job.status = "failed";
      job.error = error.message;
      saveExportJob(job);
    });

    process.on("close", (code) => {
      const renderSeconds = (Date.now() - renderStarted) / 1000;
      const frames = [...stderr.matchAll(/frame=\s*(\d+)/g)].at(-1)?.[1];
      job.metrics = { renderSeconds, totalSeconds: (Date.now() - job.createdAt) / 1000, fps: frames ? Number(frames) / renderSeconds : null, speed: totalDuration / renderSeconds };
      console.log("FFMPEG RESULT:", { id, code, outputPath, stderr, metrics: job.metrics });
      if (job.status === "failed") return;

      if (code === 0) {
        job.status = "completed";
      } else {
        job.status = "failed";
        job.error = stderr || `FFmpeg exited with code ${code}.`;
      }
      saveExportJob(job);
    });

    return res.status(202).json({
      id,
      status: job.status,
      statusUrl: `/api/exports/${id}`,
    });
  } catch (error) {
    console.error("Create export error:", error);
    return res.status(500).json({ message: error.message });
  }
}

function getExport(req, res) {
  const job = findExportJob(req.params.id);
  if (!job) return res.status(404).json({ message: "Export not found." });

  return res.json({
    id: job.id,
    status: job.status,
    error: job.error,
    metrics: job.metrics ?? null,
    downloadUrl:
      job.status === "completed" ? `/api/exports/${job.id}/download` : null,
  });
}

function downloadExport(req, res) {
  const job = findExportJob(req.params.id);

  if (!job) return res.status(404).json({ message: "Export not found." });
  if (job.status !== "completed") {
    return res.status(409).json({ message: "Export is not ready." });
  }

  return res.download(job.outputPath, `jackcut-${job.id}.mp4`);
}

module.exports = { createExport, getExport, downloadExport };
