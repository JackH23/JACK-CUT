const express = require("express");
const {
  register,
  login,
  refreshAccessToken,
  logout,
  me,
} = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh-token", refreshAccessToken);
router.post("/logout", logout);
router.get("/me", authMiddleware, me);

module.exports = router;