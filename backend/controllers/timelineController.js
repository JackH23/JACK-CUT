const { Op } = require("sequelize");

const Media = require("../models/Media");
const TimelineItem = require("../models/TimelineItem");
const Project = require("../models/Project");

const TEXT_STYLES = new Set([
  "heading",
  "subtitle",
  "title",
  "caption",
]);

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function checkMediaDuration(media, duration) {
  if (media.media_type === "image") {
    return null;
  }

  const maximumDuration = Number(
    media.duration_seconds,
  );

  if (
    !Number.isFinite(maximumDuration) ||
    maximumDuration <= 0
  ) {
    return {
      status: 422,
      body: {
        message:
          "Source duration is unavailable for this media.",
      },
    };
  }

  if (duration > maximumDuration + 0.01) {
    return {
      status: 400,
      body: {
        message:
          "Clip duration cannot exceed the source duration.",
        maximumDuration,
      },
    };
  }

  return null;
}

function validateTimelinePosition({
  trackId,
  startTime,
  duration,
}) {
  return (
    typeof trackId === "string" &&
    Boolean(trackId.trim()) &&
    typeof startTime === "number" &&
    Number.isFinite(startTime) &&
    startTime >= 0 &&
    typeof duration === "number" &&
    Number.isFinite(duration) &&
    duration > 0
  );
}

async function addTimelineItem(req, res) {
  try {
    const {
      projectId,
      mediaId,
      trackId,
      startTime,
      duration,

      // New text fields
      itemType = "MEDIA",
      textContent,
      textStyle,
    } = req.body;

    const normalizedItemType =
      typeof itemType === "string"
        ? itemType.toUpperCase()
        : "";

    if (
      !isUuid(projectId) ||
      !validateTimelinePosition({
        trackId,
        startTime,
        duration,
      }) ||
      !["MEDIA", "TEXT"].includes(
        normalizedItemType,
      )
    ) {
      return res.status(400).json({
        message:
          "Valid projectId, itemType, trackId, startTime, and duration are required.",
      });
    }

    const project = await Project.findByPk(
      projectId,
    );

    if (!project) {
      return res.status(404).json({
        message: "Project not found.",
      });
    }

    /*
     * MEDIA
     */
    if (normalizedItemType === "MEDIA") {
      if (!isUuid(mediaId)) {
        return res.status(400).json({
          message:
            "Valid mediaId is required for media timeline items.",
        });
      }

      const media = await Media.findByPk(
        mediaId,
      );

      if (!media) {
        return res.status(404).json({
          message: "Media not found.",
        });
      }

      const durationError =
        checkMediaDuration(media, duration);

      if (durationError) {
        return res
          .status(durationError.status)
          .json(durationError.body);
      }

      const item = await TimelineItem.create({
        project_id: project.id,
        media_id: media.id,
        item_type: "MEDIA",

        text_content: null,
        text_style: null,

        track_id: trackId.trim(),
        start_time: startTime,
        duration,
      });

      return res.status(201).json({
        message: "Media added to timeline.",
        item,
      });
    }

    /*
     * TEXT
     */
    const normalizedText =
      typeof textContent === "string"
        ? textContent.trim()
        : "";

    const normalizedTextStyle =
      typeof textStyle === "string"
        ? textStyle.toLowerCase()
        : "";

    if (!normalizedText) {
      return res.status(400).json({
        message:
          "Text content is required for text timeline items.",
      });
    }

    if (
      !TEXT_STYLES.has(normalizedTextStyle)
    ) {
      return res.status(400).json({
        message:
          "Valid textStyle is required. Supported styles: heading, subtitle, title, caption.",
      });
    }

    const item = await TimelineItem.create({
      project_id: project.id,

      media_id: null,
      item_type: "TEXT",

      text_content: normalizedText,
      text_style: normalizedTextStyle,

      track_id: trackId.trim(),
      start_time: startTime,
      duration,
    });

    return res.status(201).json({
      message: "Text added to timeline.",
      item,
    });
  } catch (error) {
    console.error(
      "Add timeline item error:",
      error,
    );

    return res.status(500).json({
      message:
        "Could not add item to timeline.",
    });
  }
}

async function getTimelineItems(req, res) {
  try {
    const { projectId } = req.query;

    if (!isUuid(projectId)) {
      return res.status(400).json({
        message:
          "Valid projectId is required.",
      });
    }

    const items =
      await TimelineItem.findAll({
        where: {
          project_id: projectId,
        },
        order: [
          ["start_time", "ASC"],
          ["created_at", "ASC"],
        ],
      });

    /*
     * Text items have media_id = null.
     * Only collect IDs from media items.
     */
    const mediaIds = [
      ...new Set(
        items
          .filter(
            (item) =>
              item.item_type === "MEDIA" &&
              item.media_id,
          )
          .map(
            (item) =>
              item.media_id,
          ),
      ),
    ];

    const mediaFiles =
      mediaIds.length > 0
        ? await Media.findAll({
          where: {
            id: {
              [Op.in]: mediaIds,
            },
          },
        })
        : [];

    const mediaById = new Map(
      mediaFiles.map((media) => [
        media.id,
        media,
      ]),
    );

    return res.status(200).json({
      total: items.length,

      items: items.map((item) => {
        const media = item.media_id
          ? mediaById.get(item.media_id)
          : null;

        return {
          id: item.id,
          projectId: item.project_id,

          itemType: item.item_type,

          mediaId: item.media_id,

          textContent:
            item.text_content ?? null,

          textStyle:
            item.text_style ?? null,

          trackId: item.track_id,
          startTime: Number(
            item.start_time,
          ),
          duration: Number(
            item.duration,
          ),

          media: media
            ? {
              id: media.id,
              name:
                media.original_name,
              type:
                media.media_type,
              url: `${req.protocol}://${req.get("host")}${media.file_url}`,
              size: Number(
                media.file_size,
              ),
              mimeType:
                media.mime_type,

              durationSeconds:
                media.duration_seconds ==
                  null
                  ? null
                  : Number(
                    media.duration_seconds,
                  ),
            }
            : null,
        };
      }),
    });
  } catch (error) {
    console.error(
      "Get timeline items error:",
      error,
    );

    return res.status(500).json({
      message:
        "Could not load timeline items.",
    });
  }
}

async function deleteTimelineItem(
  req,
  res,
) {
  try {
    const item =
      await TimelineItem.findByPk(
        req.params.id,
      );

    if (!item) {
      return res.status(404).json({
        message:
          "Timeline item not found.",
      });
    }

    await item.destroy();

    return res.status(200).json({
      message:
        "Timeline item removed.",
      id: item.id,
    });
  } catch (error) {
    console.error(
      "Delete timeline item error:",
      error,
    );

    return res.status(500).json({
      message:
        "Could not remove timeline item.",
    });
  }
}

async function getTimelineDuration(
  req,
  res,
) {
  try {
    const items =
      await TimelineItem.findAll({
        attributes: [
          "start_time",
          "duration",
        ],
      });

    const duration = items.reduce(
      (latestEnd, item) =>
        Math.max(
          latestEnd,
          Number(item.start_time) +
          Number(item.duration),
        ),
      0,
    );

    return res.status(200).json({
      duration,
    });
  } catch (error) {
    console.error(
      "Get timeline duration error:",
      error,
    );

    return res.status(500).json({
      message:
        "Could not load timeline duration.",
    });
  }
}

async function updateTimelineItem(
  req,
  res,
) {
  try {
    const { id } = req.params;

    const {
      startTime,
      duration,
      trackId,
    } = req.body;

    if (
      !validateTimelinePosition({
        trackId,
        startTime,
        duration,
      })
    ) {
      return res.status(400).json({
        message:
          "Valid startTime, duration, and trackId are required.",
      });
    }

    const item =
      await TimelineItem.findByPk(id);

    if (!item) {
      return res.status(404).json({
        message:
          "Timeline item not found.",
      });
    }

    /*
     * Only MEDIA items need source-duration
     * validation.
     *
     * TEXT items have no media_id.
     */
    if (item.item_type === "MEDIA") {
      const media =
        await Media.findByPk(
          item.media_id,
        );

      if (!media) {
        return res.status(404).json({
          message:
            "Source media not found.",
        });
      }

      const durationError =
        checkMediaDuration(
          media,
          duration,
        );

      if (durationError) {
        return res
          .status(durationError.status)
          .json(durationError.body);
      }
    }

    await item.update({
      start_time: startTime,
      duration,
      track_id: trackId.trim(),
    });

    return res.status(200).json({
      message:
        "Timeline item updated.",
      item,
    });
  } catch (error) {
    console.error(
      "Update timeline item error:",
      error,
    );

    return res.status(500).json({
      message:
        "Could not update timeline item.",
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