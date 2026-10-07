const Project = require("../models/Project");
const TimelineItem = require("../models/TimelineItem");
const ProjectMedia = require("../models/ProjectMedia");
const isUuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
async function projectAccess(req, res, next) {
  try {
    let projectId = req.body?.projectId || req.query.projectId;
    // Item mutation authorization must use the stored project, never a caller-supplied ID.
    if (req.params.id && req.baseUrl === "/api/timeline") {
      if (!isUuid(req.params.id)) return res.status(400).json({ message: "Valid item ID required." });
      const item = await TimelineItem.findByPk(req.params.id);
      projectId = item?.project_id;
      if (!item) return res.status(404).json({ message: "Timeline item not found." });
    }
    if (!isUuid(projectId)) return res.status(400).json({ message: "Valid projectId is required." });
    const project = await Project.findOne({ where: { id: projectId, user_id: req.user.id } });
    if (!project) return res.status(404).json({ message: "Project not found." });
    if (req.body?.mediaId) {
      if (!isUuid(req.body.mediaId) || !await ProjectMedia.findOne({ where: { project_id: projectId, media_id: req.body.mediaId } }))
        return res.status(404).json({ message: "Media not found in project." });
    }
    req.project = project;
    next();
  } catch { res.status(500).json({ message: "Could not verify project access." }); }
}
module.exports = projectAccess;
