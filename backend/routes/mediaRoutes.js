const express = require("express");

const mediaUpload = require("../middleware/mediaUpload");
const fs = require("node:fs/promises");
const {
  uploadMedia,
  getMedia,
  deleteMedia,
  mediaContent,
} = require("../controllers/mediaController");

const router = express.Router();
const auth = require("../middleware/authMiddleware");
const access = require("../middleware/projectAccess");
const { fileAuth } = require("../services/fileAccess");
router.get("/:id/content", fileAuth("media"), mediaContent);
router.use(auth);

router.get("/", access, getMedia);

router.post(
  "/upload",
  mediaUpload.array("files", 20),
  async (req, res, next) => {
    res.on("finish", () => {
      for (const file of req.files || []) fs.unlink(file.path).catch(() => {});
    });
    await access(req, res, next);
  },
  uploadMedia,
);

router.delete("/:id", access, deleteMedia);

module.exports = router;