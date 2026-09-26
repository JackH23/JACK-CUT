const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const TimelineTrack = sequelize.define(
  "TimelineTrack",
  {
    id: {
      type: DataTypes.STRING(100),
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING(10),
      allowNull: false,
      validate: {
        isIn: [["video", "audio"]],
      },
    },
    color: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "timeline_tracks",
    timestamps: true,
    underscored: true,
  },
);

module.exports = TimelineTrack;