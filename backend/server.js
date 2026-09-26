require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

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

const app = express();

app.use(cors());
app.use(express.json());

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/timeline/tracks", timelineTrackRoutes);
app.use("/api/timeline", timelineRoutes);
app.use("/api/exports", exportRoutes);

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

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();

    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
  }
}

startServer();