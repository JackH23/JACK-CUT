const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const FontOption = sequelize.define(
  "FontOption",
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

    font_family: {
      type: DataTypes.STRING(150),
      allowNull: false,
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
    tableName: "font_options",
    timestamps: true,
    underscored: true,
  },
);

module.exports = FontOption;