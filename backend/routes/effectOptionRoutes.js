const express = require("express");
const {
  getEffectOptions,
} = require("../controllers/effectOptionController");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);
router.get("/", getEffectOptions);

module.exports = router;