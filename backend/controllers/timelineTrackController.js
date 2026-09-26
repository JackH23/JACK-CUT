const TimelineTrack = require("../models/TimelineTrack");

async function getTimelineTracks(_req, res) {
  try {
    const tracks = await TimelineTrack.findAll({
      order: [["sort_order", "ASC"]],
    });

    return res.status(200).json({
      total: tracks.length,
      tracks,
    });
  } catch (error) {
    console.error("Get timeline tracks error:", error);

    return res.status(500).json({
      message: "Could not load timeline tracks.",
    });
  }
}

async function createTimelineTrack(req, res) {
  try {
    const { id, name, type, color } = req.body;

    if (
      typeof id !== "string" ||
      !/^[a-z0-9-]{1,100}$/.test(id) ||
      typeof name !== "string" ||
      !name.trim() ||
      !["video", "audio"].includes(type) ||
      typeof color !== "string" ||
      !color.trim()
    ) {
      return res.status(400).json({
        message: "Valid id, name, type, and color are required.",
      });
    }

    const lastTrack = await TimelineTrack.findOne({
      order: [["sort_order", "DESC"]],
    });

    const track = await TimelineTrack.create({
      id,
      name: name.trim(),
      type,
      color: color.trim(),
      sort_order: lastTrack ? lastTrack.sort_order + 1 : 0,
    });

    return res.status(201).json({
      message: "Timeline track created.",
      track,
    });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        message: "Track ID already exists.",
      });
    }

    console.error("Create timeline track error:", error);

    return res.status(500).json({
      message: "Could not create timeline track.",
    });
  }
}

module.exports = {
  getTimelineTracks,
  createTimelineTrack,
};