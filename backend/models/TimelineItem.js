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

    project_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "projects",
        key: "id",
      },
    },

    /*
     * MEDIA items have a media_id.
     * TEXT items do not.
     */
    media_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "media_files",
        key: "id",
      },
    },

    item_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "MEDIA",
      validate: {
        isIn: [["MEDIA", "TEXT"]],
      },
    },

    text_content: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    text_style: {
      type: DataTypes.STRING(30),
      allowNull: true,
      validate: {
        isIn: [["heading", "subtitle", "title", "caption"]],
      },
    },

    text_x: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      defaultValue: 50,
    },

    text_y: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      defaultValue: 50,
    },

    // Text styling
    font_size: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },

    font_weight: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    font_family: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    text_color: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },

    // Animation
    animation_preset: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: "none",
    },

    animation_amount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 50,
    },

    animation_in_preset: { type: DataTypes.STRING(100), allowNull: true },
    animation_in_duration: { type: DataTypes.DOUBLE, allowNull: true },
    animation_in_amount: { type: DataTypes.INTEGER, allowNull: true },
    animation_out_preset: { type: DataTypes.STRING(100), allowNull: true },
    animation_out_duration: { type: DataTypes.DOUBLE, allowNull: true },
    animation_out_amount: { type: DataTypes.INTEGER, allowNull: true },

    track_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },

    start_time: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0,
    },

    source_start: {
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

    validate: {
      validTimelineItem() {
        if (this.item_type === "MEDIA") {
          if (!this.media_id) {
            throw new Error(
              "MEDIA timeline items require media_id.",
            );
          }

          if (this.text_content != null) {
            throw new Error(
              "MEDIA timeline items cannot contain text_content.",
            );
          }
        }

        if (this.item_type === "TEXT") {
          if (this.media_id != null) {
            throw new Error(
              "TEXT timeline items cannot contain media_id.",
            );
          }

          if (
            typeof this.text_content !== "string" ||
            !this.text_content.trim()
          ) {
            throw new Error(
              "TEXT timeline items require text_content.",
            );
          }
        }
      },
    },
  },
);

module.exports = TimelineItem;