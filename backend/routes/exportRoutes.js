const express = require("express");
const {
  createExport,
  getExport,
  downloadExport,
} = require("../controllers/exportController");

const router = express.Router();
const auth = require("../middleware/authMiddleware");
const access = require("../middleware/projectAccess");
const { fileAuth } = require("../services/fileAccess");

router.post("/", auth, access, createExport);
router.get("/:id", auth, getExport);
router.get("/:id/download", fileAuth("export"), downloadExport);

module.exports = router;