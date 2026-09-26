const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  createProject,
  getProjects,
  getProject,
} = require("../controllers/projectController");

const router = express.Router();

// Applies to every route below.
router.use(authMiddleware);

router.post("/", createProject);
router.get("/", getProjects);
router.get("/:id", getProject);

module.exports = router;