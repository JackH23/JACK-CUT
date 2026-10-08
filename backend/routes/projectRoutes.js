
const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  createProject,
  getProjects,
  getProject,
  deleteProject,
} = require("../controllers/projectController");

const router = express.Router();

// Require authentication for all project routes.
router.use(authMiddleware);

// Create a project
router.post("/", createProject);

// Get all projects belonging to the user
router.get("/", getProjects);

// Get a single project
router.get("/:id", getProject);

// Delete a project belonging to the user
router.delete("/:id", deleteProject);

module.exports = router;
