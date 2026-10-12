const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const EffectOption = sequelize.define(
  "EffectOption",
  {
    value: {
      type: DataTypes.STRING(100),
      primaryKey: true,
      allowNull: false,
    },

    name: {
      type: DataTypes.STRING(100),
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
    tableName: "effect_options",
    timestamps: true,
    underscored: true,
  },
);

module.exports = EffectOption;