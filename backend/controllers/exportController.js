const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { Op } = require("sequelize");

const TimelineItem = require("../models/TimelineItem");
const Media = require("../models/Media");

const jobs = new Map();
const OUTPUT_DIR = path.resolve(process.cwd(), "exports");
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;

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

    const mediaIds = [...new Set(items.map((item) => item.media_id))];
    const mediaFiles = await Media.findAll({
      where: { id: { [Op.in]: mediaIds } },
    });
    const mediaById = new Map(mediaFiles.map((media) => [media.id, media]));

    const clips = items.map((item) => {
      const media = mediaById.get(item.media_id);
      if (!media) throw new Error(`Media ${item.media_id} was not found.`);

      return {
        type: media.media_type,
        filePath: getLocalMediaPath(media.file_url),
        start: Number(item.start_time),
        duration: Number(item.duration),
      };
    });

    for (const clip of clips) {
      if (!fs.existsSync(clip.filePath)) {
        throw new Error(`Media file is missing: ${clip.filePath}`);
      }
    }

    const totalDuration = Math.max(
      ...clips.map((clip) => clip.start + clip.duration),
    );

    if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
      return res.status(400).json({ message: "Invalid timeline duration." });
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const id = randomUUID();
    const outputPath = path.join(OUTPUT_DIR, `${id}.mp4`);
    const job = { id, status: "processing", outputPath, error: null };
    jobs.set(id, job);

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
    clips.forEach((clip) => {
      if (clip.type === "image") {
        args.push("-loop", "1", "-t", String(clip.duration));
      } else {
        args.push("-t", String(clip.duration));
      }

      args.push("-i", clip.filePath);
    });

    const filters = [];
    let currentVideo = "0:v";
    const audioLabels = ["1:a"];

    clips.forEach((clip, index) => {
      const inputIndex = index + 2;

      if (clip.type === "image" || clip.type === "video") {
        const prepared = `visual${index}`;
        const composed = `composed${index}`;

        filters.push(
          `[${inputIndex}:v]` +
            `setpts=PTS-STARTPTS+${clip.start}/TB,` +
            `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,` +
            `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2,` +
            `setsar=1[${prepared}]`,
        );

        filters.push(
          `[${currentVideo}][${prepared}]` +
            `overlay=eof_action=pass:shortest=0:enable='between(t,${clip.start},${clip.start + clip.duration})'` +
            `[${composed}]`,
        );

        currentVideo = composed;
      }

      if (clip.type === "audio" || clip.type === "video") {
        const audioLabel = `audio${index}`;
        const delayMs = Math.round(clip.start * 1000);

        filters.push(
          `[${inputIndex}:a]` +
            `atrim=duration=${clip.duration},asetpts=PTS-STARTPTS,` +
            `adelay=${delayMs}|${delayMs}[${audioLabel}]`,
        );

        audioLabels.push(audioLabel);
      }
    });

    filters.push(
      `${audioLabels.map((label) => `[${label}]`).join("")}` +
        `amix=inputs=${audioLabels.length}:duration=longest:normalize=0,` +
        `atrim=duration=${totalDuration}[outa]`,
    );

    args.push(
      "-filter_complex",
      filters.join(";"),
      "-map",
      `[${currentVideo}]`,
      "-map",
      "[outa]",
      "-t",
      String(totalDuration),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
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

    const process = spawn(
      "D:\\ffmpeg\\ffmpeg-9.0.2-full_build\\bin\\ffmpeg.exe",
      args,
    );
    let stderr = "";

    process.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });

    process.on("error", (error) => {
      job.status = "failed";
      job.error = error.message;
    });

    process.on("close", (code) => {
      if (job.status === "failed") return;

      if (code === 0) {
        job.status = "completed";
      } else {
        job.status = "failed";
        job.error = stderr || `FFmpeg exited with code ${code}.`;
      }
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
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ message: "Export not found." });

  return res.json({
    id: job.id,
    status: job.status,
    error: job.error,
    downloadUrl:
      job.status === "completed" ? `/api/exports/${job.id}/download` : null,
  });
}

function downloadExport(req, res) {
  const job = jobs.get(req.params.id);

  if (!job) return res.status(404).json({ message: "Export not found." });
  if (job.status !== "completed") {
    return res.status(409).json({ message: "Export is not ready." });
  }

  return res.download(job.outputPath, `jackcut-${job.id}.mp4`);
}

module.exports = { createExport, getExport, downloadExport };
