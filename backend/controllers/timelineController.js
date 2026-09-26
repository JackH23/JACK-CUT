const { Op } = require("sequelize");
const Media = require("../models/Media");
const TimelineItem = require("../models/TimelineItem");
const Project = require("../models/Project");

function checkMediaDuration(media, duration) {
  if (media.media_type === "image") return null;

  const maximumDuration = Number(media.duration_seconds);

  if (!Number.isFinite(maximumDuration) || maximumDuration <= 0) {
    return {
      status: 422,
      body: {
        message: "Source duration is unavailable for this media.",
      },
    };
  }

  if (duration > maximumDuration + 0.01) {
    return {
      status: 400,
      body: {
        message: "Clip duration cannot exceed the source duration.",
        maximumDuration,
      },
    };
  }

  return null;
}

async function addTimelineItem(req, res) {
  try {
    const { projectId, mediaId, trackId, startTime, duration } = req.body;

    const isUuid = (value) =>
      typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      );

    if (
      !isUuid(projectId) ||
      !isUuid(mediaId) ||
      typeof trackId !== "string" ||
      !trackId.trim() ||
      typeof startTime !== "number" ||
      !Number.isFinite(startTime) ||
      startTime < 0 ||
      typeof duration !== "number" ||
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      return res.status(400).json({
        message:
          "Valid projectId, mediaId, trackId, startTime, and duration are required.",
      });
    }

    const project = await Project.findByPk(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    const media = await Media.findByPk(mediaId);
    if (!media) {
      return res.status(404).json({ message: "Media not found." });
    }

    const durationError = checkMediaDuration(media, duration);

    if (durationError) {
      return res.status(durationError.status).json(durationError.body);
    }

    const item = await TimelineItem.create({
      project_id: project.id,
      media_id: media.id,
      track_id: trackId.trim(),
      start_time: startTime,
      duration,
    });

    return res.status(201).json({
      message: "Media added to timeline.",
      item,
    });
  } catch (error) {
    console.error("Add timeline item error:", error);
    return res.status(500).json({
      message: "Could not add media to timeline.",
    });
  }
}

async function getTimelineItems(req, res) {
  try {
    const { projectId } = req.query;

    if (
      typeof projectId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        projectId,
      )
    ) {
      return res.status(400).json({
        message: "Valid projectId is required.",
      });
    }

    const items = await TimelineItem.findAll({
      where: { project_id: projectId },
      order: [
        ["start_time", "ASC"],
        ["created_at", "ASC"],
      ],
    });

    const mediaIds = [...new Set(items.map((item) => item.media_id))];

    const mediaFiles = mediaIds.length
      ? await Media.findAll({
          where: { id: { [Op.in]: mediaIds } },
        })
      : [];

    const mediaById = new Map(mediaFiles.map((media) => [media.id, media]));

    return res.status(200).json({
      total: items.length,
      items: items.map((item) => {
        const media = mediaById.get(item.media_id);

        return {
          id: item.id,
          projectId: item.project_id,
          mediaId: item.media_id,
          trackId: item.track_id,
          startTime: item.start_time,
          duration: item.duration,
          media: media
            ? {
                id: media.id,
                name: media.original_name,
                type: media.media_type,
                url: `${req.protocol}://${req.get("host")}${media.file_url}`,
                size: Number(media.file_size),
                mimeType: media.mime_type,

                durationSeconds:
                  media.duration_seconds == null
                    ? null
                    : Number(media.duration_seconds),
              }
            : null,
        };
      }),
    });
  } catch (error) {
    console.error("Get timeline items error:", error);

    return res.status(500).json({
      message: "Could not load timeline items.",
    });
  }
}

async function deleteTimelineItem(req, res) {
  try {
    const item = await TimelineItem.findByPk(req.params.id);

    if (!item) {
      return res.status(404).json({
        message: "Timeline item not found.",
      });
    }

    await item.destroy();

    return res.status(200).json({
      message: "Timeline item removed.",
      id: item.id,
    });
  } catch (error) {
    console.error("Delete timeline item error:", error);

    return res.status(500).json({
      message: "Could not remove timeline item.",
    });
  }
}

async function getTimelineDuration(req, res) {
  try {
    const items = await TimelineItem.findAll({
      attributes: ["start_time", "duration"],
    });

    const duration = items.reduce(
      (latestEnd, item) => Math.max(latestEnd, item.start_time + item.duration),
      0,
    );

    return res.status(200).json({ duration });
  } catch (error) {
    console.error("Get timeline duration error:", error);

    return res.status(500).json({
      message: "Could not load timeline duration.",
    });
  }
}

async function updateTimelineItem(req, res) {
  try {
    const { id } = req.params;
    const { startTime, duration, trackId } = req.body;

    if (
      typeof startTime !== "number" ||
      !Number.isFinite(startTime) ||
      startTime < 0 ||
      typeof duration !== "number" ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      typeof trackId !== "string" ||
      !trackId.trim()
    ) {
      return res.status(400).json({
        message: "Valid startTime, duration, and trackId are required.",
      });
    }

    const item = await TimelineItem.findByPk(id);

    if (!item) {
      return res.status(404).json({
        message: "Timeline item not found.",
      });
    }

    const media = await Media.findByPk(item.media_id);

    if (!media) {
      return res.status(404).json({
        message: "Source media not found.",
      });
    }

    const durationError = checkMediaDuration(media, duration);

    if (durationError) {
      return res.status(durationError.status).json(durationError.body);
    }

    await item.update({
      start_time: startTime,
      duration,
      track_id: trackId.trim(),
    });

    return res.json({ message: "Timeline item updated.", item });
  } catch (error) {
    console.error("Update timeline item error:", error);
    return res.status(500).json({
      message: "Could not update timeline item.",
    });
  }
}

module.exports = {
  addTimelineItem,
  getTimelineItems,
  deleteTimelineItem,
  getTimelineDuration,
  updateTimelineItem,
};
