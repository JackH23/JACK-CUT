const express = require("express");
const {
  createExport,
  getExport,
  downloadExport,
} = require("../controllers/exportController");

const router = express.Router();

router.post("/", createExport);
router.get("/:id", getExport);
router.get("/:id/download", downloadExport);

module.exports = router;