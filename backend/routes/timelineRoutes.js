const express = require("express");

const {
  addTimelineItem,
  getTimelineItems,
  deleteTimelineItem,
  getTimelineDuration,
  updateTimelineItem
} = require("../controllers/timelineController");

const router = express.Router();
router.use(require("../middleware/authMiddleware"));
router.use(require("../middleware/projectAccess"));

router.get("/items", getTimelineItems);
router.post("/items", addTimelineItem);
router.get("/duration", getTimelineDuration);
router.delete("/items/:id", deleteTimelineItem);
router.patch("/items/:id", updateTimelineItem);

module.exports = router;