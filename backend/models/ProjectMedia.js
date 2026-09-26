const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ProjectMedia = sequelize.define(
  "ProjectMedia",
  {
    project_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
    },
    media_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
    },
  },
  {
    tableName: "project_media",
    timestamps: false,
  },
);

module.exports = ProjectMedia;