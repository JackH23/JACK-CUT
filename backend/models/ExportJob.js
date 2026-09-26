const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ExportJob = sequelize.define(
  "ExportJob",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    project_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "projects",
        key: "id",
      },
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "processing",
      validate: {
        isIn: [["processing", "completed", "failed"]],
      },
    },
    output_path: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "export_jobs",
    timestamps: true,
    underscored: true,
  },
);

module.exports = ExportJob;