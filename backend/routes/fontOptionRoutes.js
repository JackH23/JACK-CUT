const express = require("express");
const {
  getFontOptions,
} = require("../controllers/fontOptionController");

const router = express.Router();

router.get("/", getFontOptions);

module.exports = router;