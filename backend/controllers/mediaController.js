const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);
const fs = require("fs/promises");
const path = require("path");
const { Op } = require("sequelize");
const sequelize = require("../config/database");
const Media = require("../models/Media");
const Project = require("../models/Project");
const ProjectMedia = require("../models/ProjectMedia");
const TimelineItem = require("../models/TimelineItem");

const isUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function getMediaType(mimeType) {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "image";
}

async function getDurationSeconds(filePath) {
  const { stdout } = await execFileAsync(
    process.env.FFPROBE_PATH || "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { timeout: 30000 },
  );

  const duration = Number(stdout.trim());

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not determine media duration: ${filePath}`);
  }

  return duration;
}

function formatMedia(media, req) {
  return {
    id: media.id,
    name: media.original_name,
    type: media.media_type,
    url: `${req.protocol}://${req.get("host")}${media.file_url}`,
    size: Number(media.file_size),
    mimeType: media.mime_type,
    durationSeconds:
      media.duration_seconds == null ? null : Number(media.duration_seconds),
    createdAt: media.created_at,
  };
}

async function uploadMedia(req, res) {
  const files = req.files ?? [];
  const { projectId } = req.body;

  if (!isUuid(projectId)) {
    await Promise.all(
      files.map((file) => fs.unlink(file.path).catch(() => {})),
    );
    return res.status(400).json({ message: "Valid projectId is required." });
  }

  if (files.length === 0) {
    return res.status(400).json({
      message: "Please select at least one media file.",
    });
  }

  try {
    const project = await Project.findByPk(projectId);

    if (!project) {
      await Promise.all(
        files.map((file) => fs.unlink(file.path).catch(() => {})),
      );
      return res.status(404).json({ message: "Project not found." });
    }

    const createdMedia = await sequelize.transaction(async (transaction) => {
      const media = [];

      for (const file of files) {
        const mediaType = getMediaType(file.mimetype);
        const durationSeconds =
          mediaType === "image" ? null : await getDurationSeconds(file.path);

        const item = await Media.create(
          {
            original_name: file.originalname,
            file_name: file.filename,
            file_path: file.path,
            file_url: `/uploads/media/${file.filename}`,
            mime_type: file.mimetype,
            media_type: mediaType,
            file_size: file.size,
            duration_seconds: durationSeconds,
          },
          { transaction },
        );

        await ProjectMedia.create(
          { project_id: projectId, media_id: item.id },
          { transaction },
        );

        media.push(item);
      }

      return media;
    });

    return res.status(201).json({
      message: "Media uploaded successfully.",
      media: createdMedia.map((item) => formatMedia(item, req)),
    });
  } catch (error) {
    console.error("Upload media error:", error);
    await Promise.all(
      files.map((file) => fs.unlink(file.path).catch(() => {})),
    );
    return res.status(500).json({ message: "Could not upload media." });
  }
}

async function getMedia(req, res) {
  try {
    const { projectId } = req.query;

    if (!isUuid(projectId)) {
      return res.status(400).json({ message: "Valid projectId is required." });
    }

    const links = await ProjectMedia.findAll({
      where: { project_id: projectId },
      attributes: ["media_id"],
    });

    const mediaIds = links.map((link) => link.media_id);
    const media = mediaIds.length
      ? await Media.findAll({
          where: { id: { [Op.in]: mediaIds } },
          order: [["created_at", "DESC"]],
        })
      : [];

    return res.status(200).json({
      total: media.length,
      media: media.map((item) => formatMedia(item, req)),
    });
  } catch (error) {
    console.error("Get media error:", error);
    return res.status(500).json({ message: "Could not load media." });
  }
}

async function deleteMedia(req, res) {
  try {
    const { id } = req.params;
    const { projectId } = req.query;

    if (!isUuid(projectId) || !isUuid(id)) {
      return res.status(400).json({
        message: "Valid projectId and media ID are required.",
      });
    }

    const result = await sequelize.transaction(async (transaction) => {
      const link = await ProjectMedia.findOne({
        where: { project_id: projectId, media_id: id },
        transaction,
      });

      if (!link) return null;

      const removedTimelineItems = await TimelineItem.destroy({
        where: { project_id: projectId, media_id: id },
        transaction,
      });

      await link.destroy({ transaction });

      return { removedTimelineItems };
    });

    if (!result) {
      return res.status(404).json({
        message: "Media not found in project.",
      });
    }

    return res.status(200).json({
      message: "Media and its timeline clips removed from project.",
      removedTimelineItems: result.removedTimelineItems,
    });
  } catch (error) {
    console.error("Delete media error:", error);
    return res.status(500).json({
      message: "Could not remove media.",
    });
  }
}

module.exports = { uploadMedia, getMedia, deleteMedia };
