const Project = require("../models/Project");
const ExportJob = require("../models/ExportJob");
const TimelineItem = require("../models/TimelineItem");
const ProjectMedia = require("../models/ProjectMedia");
const sequelize = require("../config/database");
const { hasActiveProjectExport } = require("./exportController");
const isUuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function isDuplicateProjectName(error) {
  return (
    error?.name === "SequelizeUniqueConstraintError" &&
    (
      error?.original?.constraint === "projects_user_name_unique" ||
      error?.parent?.constraint === "projects_user_name_unique"
    )
  );
}

async function createProject(req, res) {
  try {
    const name = req.body?.name;

    if (typeof name !== "string" || !name.trim() || name.trim().length > 255) {
      return res.status(400).json({
        message: "Project name is required and must be at most 255 characters.",
      });
    }

    const project = await Project.create({
      name: name.trim(),
      user_id: req.user.id,
    });

    return res.status(201).json({
      message: "Project created.",
      project: {
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
      },
    });
  } catch (error) {
    if (isDuplicateProjectName(error)) {
      return res.status(409).json({
        message:
          "You already have a project with this name. Choose another name.",
      });
    }

    console.error("Create project error:", error);

    return res.status(500).json({
      message: "Could not create project.",
    });
  }
}

async function getProjects(req, res) {
  try {
    const page = Math.max(
      parseInt(req.query.page, 10) || 1,
      1,
    );

    const limit = Math.min(
      Math.max(
        parseInt(req.query.limit, 10) || 12,
        1,
      ),
      100,
    );

    const offset = (page - 1) * limit;

    if (!Number.isSafeInteger(offset)) {
      return res.status(400).json({
        message: "Page number is too large.",
      });
    }

    const { count, rows } =
      await Project.findAndCountAll({
        where: {
          user_id: req.user.id,
        },
        order: [
          ["created_at", "DESC"],
          ["id", "DESC"],
        ],
        limit,
        offset,
      });

    const totalPages = Math.ceil(count / limit);

    return res.status(200).json({
      projects: rows,
      total: count,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    });
  } catch (error) {
    console.error("Get projects error:", error);

    return res.status(500).json({
      message: "Could not load projects.",
    });
  }
}

async function getProject(req, res) {
  if (!isUuid(req.params.id)) return res.status(400).json({ message: "Valid project ID required." });
  try {
    const project = await Project.findOne({
      where: {
        id: req.params.id,
        user_id: req.user.id,
      },
    });

    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    return res.json({ project });
  } catch (error) {
    console.error("Get project error:", error);
    return res.status(500).json({ message: "Could not load project." });
  }
}



async function deleteProject(req, res) {
  if (!isUuid(req.params.id)) return res.status(400).json({ message: "Valid project ID required." });
  try {
    const result = await sequelize.transaction(async transaction => {
      // Export reservation takes the same parent lock before inserting a processing job.
      const project = await Project.findOne({ where: { id: req.params.id, user_id: req.user.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!project) return { status: 404, body: { message: "Project not found." } };
      if (hasActiveProjectExport(project.id) || await ExportJob.findOne({ where: { project_id: project.id, status: "processing" }, transaction })) {
        return { status: 409, body: { message: "This project is currently exporting a video. Cancel or finish the export before deleting the project." } };
      }
      // Preserve export history and cleanup intents. Updating child rows waits for
      // active downloads/recovery transactions holding export row locks.
      await ExportJob.update({ project_id: null }, { where: { project_id: project.id }, transaction, silent: true });
      await TimelineItem.destroy({ where: { project_id: project.id }, transaction });
      await ProjectMedia.destroy({ where: { project_id: project.id }, transaction });
      // Tracks are shared definitions; uploaded Media rows/objects are shared too.
      await project.destroy({ transaction });
      return { status: 200, body: { message: "Project deleted successfully.", projectId: project.id } };
    });
    return res.status(result.status).json(result.body);
  } catch {
    return res.status(500).json({ message: "Could not delete project." });
  }
}

async function updateProject(req, res) {
  if (!isUuid(req.params.id)) {
    return res.status(400).json({
      message: "Valid project ID required.",
    });
  }

  const name = req.body?.name;

  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 255
  ) {
    return res.status(400).json({
      message:
        "Project name is required and must be at most 255 characters.",
    });
  }

  try {
    const [updatedCount, updatedProjects] = await Project.update(
      { name: name.trim() },
      {
        where: {
          id: req.params.id,
          user_id: req.user.id,
        },
        returning: true,
      },
    );

    if (updatedCount === 0) {
      return res.status(404).json({
        message: "Project not found.",
      });
    }

    return res.status(200).json({
      message: "Project name updated.",
      project: updatedProjects[0],
    });
  } catch (error) {
    if (isDuplicateProjectName(error)) {
      return res.status(409).json({
        message:
          "You already have a project with this name. Choose another name.",
      });
    }

    console.error("Update project error:", error);

    return res.status(500).json({
      message: "Could not update project name.",
    });
  }
}

module.exports = {
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
};