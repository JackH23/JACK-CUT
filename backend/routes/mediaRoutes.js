const express = require("express");

const mediaUpload = require("../middleware/mediaUpload");
const {
  uploadMedia,
  getMedia,
  deleteMedia,
} = require("../controllers/mediaController");

const router = express.Router();

router.get("/", getMedia);

router.post(
  "/upload",
  mediaUpload.array("files", 20),
  uploadMedia,
);

router.delete("/:id", deleteMedia);

module.exports = router;