const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const AnimationOption = sequelize.define(
  "AnimationOption",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },

    value: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },

    icon: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },

    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "text",
    },

    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "animation_options",
    timestamps: true,
    underscored: true,
  },
);

module.exports = AnimationOption;