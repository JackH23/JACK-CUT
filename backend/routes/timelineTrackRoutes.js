const express = require("express");
const {
  getTimelineTracks,
  createTimelineTrack,
} = require("../controllers/timelineTrackController");

const router = express.Router();
router.use(require("../middleware/authMiddleware"));

router.get("/", getTimelineTracks);
router.post("/", createTimelineTrack);

module.exports = router;