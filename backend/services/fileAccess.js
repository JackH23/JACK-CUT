const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
function fileUrl(req, kind, id) {
  const route = kind === "media" ? "/api/media/" + id + "/content" : "/api/exports/" + id + "/download";
  const token = jwt.sign({ userId: req.user.id, kind, resourceId: id }, process.env.JWT_SECRET,
    { algorithm: "HS256", audience: "jackcut-file", expiresIn: "1h" });
  return route + "?ticket=" + encodeURIComponent(token);
}
function fileAuth(kind) {
  return async (req, res, next) => {
    if (req.headers.authorization) return authMiddleware(req, res, next);
    try {
      const payload = jwt.verify(req.query.ticket, process.env.JWT_SECRET, { algorithms: ["HS256"], audience: "jackcut-file" });
      if (payload.kind !== kind || payload.resourceId !== req.params.id) throw new Error("Wrong file.");
      req.user = await User.findByPk(payload.userId);
      if (!req.user) throw new Error("Unknown user.");
      next();
    } catch { res.status(401).json({ message: "Authentication required or file link expired. Reload the project to renew it." }); }
  };
}
function mediaUrl(req, media) { return req.protocol + "://" + req.get("host") + fileUrl(req, "media", media.id); }
module.exports = { fileUrl, fileAuth, mediaUrl };
