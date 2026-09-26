const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Media = sequelize.define(
  "Media",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    original_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    file_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    file_path: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    file_url: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    mime_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    media_type: {
      type: DataTypes.ENUM("video", "audio", "image"),
      allowNull: false,
    },

    file_size: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },

    duration_seconds: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
  },
  {
    tableName: "media_files",
    timestamps: true,
    underscored: true,
  },
);

module.exports = Media;