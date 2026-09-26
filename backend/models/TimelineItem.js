const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const TimelineItem = sequelize.define(
  "TimelineItem",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    project_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "projects",
        key: "id",
      },
    },

    media_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "media_files",
        key: "id",
      },
    },

    media_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "media_files",
        key: "id",
      },
    },

    track_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },

    start_time: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0,
    },

    duration: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
  },
  {
    tableName: "timeline_items",
    timestamps: true,
    underscored: true,
  },
);

module.exports = TimelineItem;
