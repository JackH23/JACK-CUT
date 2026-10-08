
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
        isIn: [["processing", "completed", "failed", "cancelled"]],
      },
    },

    // Video rendering progress: 0–100%
    progress: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 100,
      },
    },

    metrics: {
      type: DataTypes.JSONB,
      allowNull: true,
    },

    output_path: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // Durable deletion intent: committed before removing storage, cleared after acknowledgement.
    cleanup_reference: { type: DataTypes.TEXT, allowNull: true },

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
