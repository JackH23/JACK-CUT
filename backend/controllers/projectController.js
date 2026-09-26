const Project = require("../models/Project");

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
    console.error("Create project error:", error);
    return res.status(500).json({ message: "Could not create project." });
  }
}

async function getProjects(req, res) {
  try {
    const projects = await Project.findAll({
      where: { user_id: req.user.id },
      order: [["created_at", "DESC"]],
    });

    return res.json({ projects });
  } catch (error) {
    console.error("Get projects error:", error);
    return res.status(500).json({ message: "Could not load projects." });
  }
}

async function getProject(req, res) {
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

module.exports = { createProject, getProjects, getProject };