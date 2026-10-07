const { Sequelize } = require("sequelize");

const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required in production.");
}

const sequelize = isProduction
  ? new Sequelize(process.env.DATABASE_URL, {
      dialect: "postgres",
      logging: false,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      },
    })
  : new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASSWORD,
      {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        dialect: "postgres",
        logging: false,
      },
    );

module.exports = sequelize;
