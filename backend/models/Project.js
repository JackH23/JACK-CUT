const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Project = sequelize.define(
  "Project",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true, // Existing projects currently have no owner.
      references: {
        model: "users",
        key: "id",
      },
    },
  },
  {
    tableName: "projects",
    timestamps: true,
    underscored: true,
  },
);

module.exports = Project;