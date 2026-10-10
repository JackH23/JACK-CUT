require("dotenv").config({ quiet: true });

const express = require("express");
const cors = require("cors");

const sequelize = require("./config/database");
const User = require("./models/User");
const Project = require("./models/Project");
const RefreshToken = require("./models/RefreshToken");

User.hasMany(Project, {
  foreignKey: "user_id",
  as: "projects",
});

Project.belongsTo(User, {
  foreignKey: "user_id",
  as: "owner",
});

User.hasMany(RefreshToken, {
  foreignKey: "user_id",
  as: "refreshTokens",
});

RefreshToken.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
});

const authRoutes = require("./routes/authRoutes");
const mediaRoutes = require("./routes/mediaRoutes");
const timelineRoutes = require("./routes/timelineRoutes");
const timelineTrackRoutes = require("./routes/timelineTrackRoutes");
const exportRoutes = require("./routes/exportRoutes");
const projectRoutes = require("./routes/projectRoutes");
const fontOptionRoutes =
  require("./routes/fontOptionRoutes");
const animationOptionRoutes =
  require("./routes/animationOptionRoutes");

const app = express();

app.use(cors());
app.use(express.json());

// Persistent files are served only by authorized content/download endpoints.
if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : process.env.TRUST_PROXY);

app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/timeline/tracks", timelineTrackRoutes);
app.use("/api/timeline", timelineRoutes);
app.use("/api/exports", (req, res, next) => {
  const started = Date.now();
  res.on("finish", () => console.log("EXPORT HTTP:", {
    method: req.method, path: req.path, status: res.statusCode,
    elapsedMs: Date.now() - started,
  }));
  next();
}, exportRoutes);
app.use(
  "/api/font-options",
  fontOptionRoutes,
);
app.use(
  "/api/animation-options",
  animationOptionRoutes,
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/", (req, res) => {
  res.json({ message: "JackCut backend is running" });
});

app.use((error, _req, res, _next) => {
  if (error.name === "MulterError") {
    return res.status(400).json({ message: error.message });
  }

  return res.status(500).json({
    message: error.message || "Internal server error.",
  });
});

const PORT = process.env.PORT || 5001;

async function startServer() {
  try {
    require("./services/storage").driver();
    await sequelize.authenticate();
    await sequelize.sync();
    const exportColumns = await sequelize.getQueryInterface().describeTable("export_jobs");
    require('./utils/exportDeadlineSchema').assertExportDeadlineSchema(exportColumns);
    for (const [name, type] of [['worker_token', 'UUID'], ['heartbeat_at', 'DATE'], ['cancel_requested_at', 'DATE'], ['stage', 'STRING']]) {
      if (!exportColumns[name]) try {
        await sequelize.getQueryInterface().addColumn('export_jobs', name, { type: require('sequelize').DataTypes[type], allowNull: true });
      } catch (error) { if (error.original?.code !== '42701') throw error; }
    }
    if (!exportColumns.metrics) await sequelize.getQueryInterface().addColumn("export_jobs", "metrics", {
      type: require("sequelize").DataTypes.JSONB, allowNull: true,
    });
    if (!exportColumns.cleanup_reference) try {
      await sequelize.getQueryInterface().addColumn('export_jobs', 'cleanup_reference', {
        type: require('sequelize').DataTypes.TEXT, allowNull: true,
      });
    } catch (error) { if (error.original?.code !== '42701') throw error; }
    await sequelize.query("CREATE INDEX IF NOT EXISTS export_jobs_cleanup_recovery ON export_jobs (completed_at) WHERE status = 'completed' AND cleanup_reference IS NOT NULL");
    await sequelize.query("CREATE INDEX IF NOT EXISTS export_jobs_active_heartbeat ON export_jobs (heartbeat_at, created_at) WHERE status = 'processing'");
    // Additive migration for existing databases; never alter or reset other columns.
    const queryInterface = sequelize.getQueryInterface();
    const columns = await queryInterface.describeTable("timeline_items");
    if (!columns.source_start) {
      await queryInterface.addColumn("timeline_items", "source_start", {
        type: require("sequelize").DataTypes.DOUBLE,
        allowNull: false,
        defaultValue: 0,
      });
    }

    for (const name of ["animation_in_preset","animation_in_duration","animation_in_amount","animation_out_preset","animation_out_duration","animation_out_amount"]) {
      if (!columns[name]) try { await queryInterface.addColumn('timeline_items', name, {
        type: name.endsWith('preset') ? require('sequelize').DataTypes.STRING(100) : name.endsWith('amount') ? require('sequelize').DataTypes.INTEGER : require('sequelize').DataTypes.DOUBLE,
        allowNull: true,
      }); } catch(error) { if(error.original?.code !== '42701') throw error; }
    }
    for (const [name, defaultValue] of [["media_scale", 1], ["media_x", 0], ["media_y", 0]]) {
      if (!columns[name]) try {
        await queryInterface.addColumn("timeline_items", name, { type: require("sequelize").DataTypes.DOUBLE, allowNull: false, defaultValue });
      } catch (error) { if (error.original?.code !== "42701") throw error; }
    }
    // NULL means legacy mode: no destructive rewrite of existing animation trajectories.
    // Partial index keeps the recurring candidate lookup independent of retained history size.
    await sequelize.query("CREATE INDEX IF NOT EXISTS export_jobs_cleanup_candidates ON export_jobs (completed_at) WHERE status = 'completed' AND output_path IS NOT NULL");
    const exportCleanup = require("./services/exportCleanupService").getService();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server is running on http://localhost:${PORT}`);
      exportCleanup.start();
      require('./controllers/exportController').startExportRecovery();
    });
  } catch (error) {
    console.error("Server startup failed; verify storage configuration, database connectivity and schema permissions.");
    process.exitCode = 1;
  }
}

startServer();
