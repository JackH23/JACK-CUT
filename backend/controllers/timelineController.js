const {animationFields,getMediaAnimationSettings}=require('../../frontend/lib/mediaAnimation');
const { Op } = require("sequelize");

const Media = require("../models/Media");
const TimelineItem = require("../models/TimelineItem");
const Project = require("../models/Project");
const AnimationOption =
  require("../models/AnimationOption");

const TEXT_STYLES = new Set([
  "heading",
  "subtitle",
  "title",
  "caption",
]);

const TEXT_STYLE_DEFAULTS = {
  heading: {
    fontSize: 48,
    fontWeight: 700,
    fontFamily: "Arial",
    textColor: "#ffffff",
  },

  title: {
    fontSize: 36,
    fontWeight: 700,
    fontFamily: "Arial",
    textColor: "#ffffff",
  },

  subtitle: {
    fontSize: 30,
    fontWeight: 600,
    fontFamily: "Arial",
    textColor: "#ffffff",
  },

  caption: {
    fontSize: 20,
    fontWeight: 500,
    fontFamily: "Arial",
    textColor: "#ffffff",
  },
};

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function checkMediaDuration(media, duration, sourceStart = 0) {
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

  if (sourceStart + duration > maximumDuration + 0.01) {
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

      sourceStart = 0,
      textX = 50,
      textY = 50,
      fontSize,
      fontWeight,
      fontFamily,
      textColor,

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

    if (typeof sourceStart !== "number" || !Number.isFinite(sourceStart) || sourceStart < 0) {
      return res.status(400).json({ message: "sourceStart must be a non-negative number." });
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
        checkMediaDuration(media, duration, sourceStart);

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
        source_start: sourceStart,
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

    const textDefaults =
      TEXT_STYLE_DEFAULTS[
      normalizedTextStyle
      ];

    if (
      ![textX, textY].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100) ||
      (fontSize !== undefined && (typeof fontSize !== "number" || !Number.isFinite(fontSize) || fontSize < 8 || fontSize > 200)) ||
      (fontWeight !== undefined && (typeof fontWeight !== "number" || !Number.isInteger(fontWeight) || fontWeight < 100 || fontWeight > 900)) ||
      (fontFamily !== undefined && (typeof fontFamily !== "string" || !fontFamily.trim() || fontFamily.length > 100)) ||
      (textColor !== undefined && (typeof textColor !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(textColor)))
    ) {
      return res.status(400).json({ message: "Invalid text position or font styling." });
    }

    const item = await TimelineItem.create({
      project_id: project.id,

      media_id: null,
      item_type: "TEXT",

      text_content: normalizedText,
      text_style: normalizedTextStyle,

      // Default text position
      text_x: textX,
      text_y: textY,

      // Default text styling
      font_size:
        fontSize ?? textDefaults.fontSize,

      font_weight:
        fontWeight ?? textDefaults.fontWeight,

      font_family:
        fontFamily?.trim() ?? textDefaults.fontFamily,

      text_color:
        textColor ?? textDefaults.textColor,

      track_id: trackId.trim(),
      start_time: startTime,
      source_start: sourceStart,
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

          textX:
            item.text_x == null
              ? 50
              : Number(item.text_x),

          textY:
            item.text_y == null
              ? 50
              : Number(item.text_y),

          fontSize:
            item.font_size == null
              ? null
              : Number(item.font_size),

          fontWeight:
            item.font_weight == null
              ? null
              : Number(item.font_weight),

          fontFamily:
            item.font_family ?? null,

          textColor:
            item.text_color ?? null,

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

          trackId: item.track_id,
          startTime: Number(
            item.start_time,
          ),
          duration: Number(
            item.duration,
          ),
          sourceStart: Number(item.source_start ?? 0),

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
      textContent,
      textX,
      textY,

      sourceStart,

      // Text styling
      fontSize,
      fontWeight,
      fontFamily,
      textColor,

      // Animation
      animationPreset,
      animationAmount,
    } = req.body;

    const isAnimationUpdate =
      animationPreset !== undefined ||
      animationAmount !== undefined || animationFields.some(key => req.body[key] !== undefined);

    const isTextUpdate =
      textContent !== undefined;

    const isTextPositionUpdate =
      textX !== undefined ||
      textY !== undefined;

    const isTextStyleUpdate =
      fontSize !== undefined ||
      fontWeight !== undefined ||
      fontFamily !== undefined ||
      textColor !== undefined;

    const isPositionUpdate =
      startTime !== undefined ||
      duration !== undefined ||
      trackId !== undefined;

    if (
      !isTextUpdate &&
      !isTextPositionUpdate &&
      !isTextStyleUpdate &&
      !isPositionUpdate &&
      !isAnimationUpdate &&
      sourceStart === undefined
    ) {
      return res.status(400).json({
        message:
          "No timeline item changes were provided.",
      });
    }

    if (
      isPositionUpdate &&
      !validateTimelinePosition({
        trackId,
        startTime,
        duration,
      })
    ) {
      return res.status(400).json({
        message:
          "Valid startTime, duration, and trackId are required when updating clip position.",
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
    if (item.item_type === "MEDIA" && (isPositionUpdate || sourceStart !== undefined)) {
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
          duration ?? Number(item.duration),
          sourceStart ?? Number(item.source_start ?? 0),
        );

      if (durationError) {
        return res
          .status(durationError.status)
          .json(durationError.body);
      }
    }

    const updates = {};
    if (sourceStart !== undefined) {
      if (typeof sourceStart !== "number" || !Number.isFinite(sourceStart) || sourceStart < 0) {
        return res.status(400).json({ message: "sourceStart must be a non-negative number." });
      }
      updates.source_start = sourceStart;
    }

    if (isPositionUpdate) {
      updates.start_time = startTime;
      updates.duration = duration;
      updates.track_id = trackId.trim();
    }

    if (isTextUpdate) {
      if (item.item_type !== "TEXT") {
        return res.status(400).json({
          message: "Only text timeline items can update text content.",
        });
      }

      const normalizedText =
        typeof textContent === "string"
          ? textContent.trim()
          : "";

      if (!normalizedText) {
        return res.status(400).json({
          message: "Text content cannot be empty.",
        });
      }

      updates.text_content = normalizedText;
    }

    if (isTextPositionUpdate) {
      if (item.item_type !== "TEXT") {
        return res.status(400).json({
          message:
            "Only text timeline items can update text position.",
        });
      }

      if (
        typeof textX !== "number" ||
        !Number.isFinite(textX) ||
        textX < 0 ||
        textX > 100 ||
        typeof textY !== "number" ||
        !Number.isFinite(textY) ||
        textY < 0 ||
        textY > 100
      ) {
        return res.status(400).json({
          message:
            "textX and textY must be numbers between 0 and 100.",
        });
      }

      updates.text_x = textX;
      updates.text_y = textY;
    }

    if (isTextStyleUpdate) {
      if (item.item_type !== "TEXT") {
        return res.status(400).json({
          message:
            "Only text timeline items can update text styling.",
        });
      }

      if (fontSize !== undefined) {
        if (
          typeof fontSize !== "number" ||
          !Number.isFinite(fontSize) ||
          fontSize < 8 ||
          fontSize > 200
        ) {
          return res.status(400).json({
            message:
              "fontSize must be a number between 8 and 200.",
          });
        }

        updates.font_size = fontSize;
      }

      if (fontWeight !== undefined) {
        if (
          typeof fontWeight !== "number" ||
          !Number.isFinite(fontWeight) ||
          fontWeight < 100 ||
          fontWeight > 900
        ) {
          return res.status(400).json({
            message:
              "fontWeight must be a number between 100 and 900.",
          });
        }

        updates.font_weight = fontWeight;
      }

      if (fontFamily !== undefined) {
        if (
          typeof fontFamily !== "string" ||
          !fontFamily.trim()
        ) {
          return res.status(400).json({
            message:
              "fontFamily must be a non-empty string.",
          });
        }

        updates.font_family =
          fontFamily.trim();
      }

      if (textColor !== undefined) {
        if (
          typeof textColor !== "string" ||
          !/^#[0-9A-Fa-f]{6}$/.test(
            textColor,
          )
        ) {
          return res.status(400).json({
            message:
              "textColor must be a valid hex color such as #ffffff.",
          });
        }

        updates.text_color = textColor;
      }
    }

    if (isAnimationUpdate) {
      if (animationPreset !== undefined) {
        if (
          typeof animationPreset !== "string" ||
          !animationPreset.trim()
        ) {
          return res.status(400).json({
            message:
              "animationPreset must be a non-empty string.",
          });
        }

        const animationOption =
          await AnimationOption.findOne({
            where: {
              value: animationPreset.trim(),
              is_active: true,
            },
          });

        if (!animationOption) {
          return res.status(400).json({
            message:
              "Invalid animation preset.",
          });
        }

        updates.animation_preset =
          animationPreset.trim();
      }

      if (animationAmount !== undefined) {
        if (
          typeof animationAmount !== "number" ||
          !Number.isFinite(animationAmount) ||
          animationAmount < 0 ||
          animationAmount > 100
        ) {
          return res.status(400).json({
            message:
              "animationAmount must be a number between 0 and 100.",
          });
        }

        updates.animation_amount =
          Math.round(animationAmount);
      }
    }

    const phaseUpdate=animationFields.some(key=>req.body[key]!==undefined);
    if(phaseUpdate) {
      if(item.item_type!=='MEDIA') return res.status(400).json({message:'Animation In/Out is only supported for MEDIA items.'});
      const base=getMediaAnimationSettings({duration:Number(item.duration),animationPreset:item.animation_preset,animationAmount:item.animation_amount,animationInPreset:item.animation_in_preset,animationInDuration:item.animation_in_duration,animationInAmount:item.animation_in_amount,animationOutPreset:item.animation_out_preset,animationOutDuration:item.animation_out_duration,animationOutAmount:item.animation_out_amount});
      for(const phase of ['In','Out']) {
        const key='animation'+phase+'Preset';
        if(req.body[key]!==undefined) {
          const allowed=phase==='In'?['none','fade-in','zoom-in','slide-left','slide-right']:['none','fade-out','zoom-out','slide-left','slide-right'];
          if(!allowed.includes(req.body[key]) || !await AnimationOption.findOne({where:{value:req.body[key],is_active:true}})) return res.status(400).json({message:'Invalid '+key+'.'});
        }
        for(const part of ['Duration','Amount']) {
          const field='animation'+phase+part, value=req.body[field];
          if(value!==undefined && (typeof value!=='number'||!Number.isFinite(value)||value<0||(part==='Amount'&&value>100))) return res.status(400).json({message:field+' must be a finite non-negative number'+(part==='Amount'?' between 0 and 100.':'.')});
        }
      }
      for(const key of animationFields) {
        const value=req.body[key]??base[key];
        const column=key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase());
        updates[column]=key.endsWith('Duration')?Math.min(value,duration??Number(item.duration)):key.endsWith('Amount')?Math.round(value):value;
      }
    }
    // Resizing also clamps saved phase durations; preview clamps immediately while dragging.
    if(isPositionUpdate) for(const name of ['animation_in_duration','animation_out_duration']) {
      if(item[name]!=null && updates[name]===undefined) updates[name]=Math.min(Number(item[name]),duration);
    }
    await item.update(updates);

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