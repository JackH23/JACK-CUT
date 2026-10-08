
const express = require("express");

const {
  createExport,
  getExport,
  cancelExport,
  downloadExport,
} = require("../controllers/exportController");

const router = express.Router();

const auth = require("../middleware/authMiddleware");
const access = require("../middleware/projectAccess");
const { fileAuth } = require("../services/fileAccess");

// Create a new export
router.post("/", auth, access, createExport);

// Get export status and progress
router.get("/:id", auth, getExport);

// Cancel an active export
router.post("/:id/cancel", auth, cancelExport);

// Download completed export
router.get(
  "/:id/download",
  fileAuth("export"),
  downloadExport,
);

module.exports = router;
