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
// Route-level placement exposes :id, so ownership is checked against the stored item.
const projectAccess = require("../middleware/projectAccess");

router.get("/items", projectAccess, getTimelineItems);
router.post("/items", projectAccess, addTimelineItem);
router.get("/duration", projectAccess, getTimelineDuration);
router.delete("/items/:id", projectAccess, deleteTimelineItem);
router.patch("/items/:id", projectAccess, updateTimelineItem);

module.exports = router;