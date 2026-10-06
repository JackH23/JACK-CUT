const express = require("express");
const {
  getAnimationOptions,
} = require("../controllers/animationOptionController");

const router = express.Router();

router.get("/", getAnimationOptions);

module.exports = router;