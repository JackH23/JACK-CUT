const { Sequelize } = require("sequelize");

// Server-side limits bound SQL itself, including terminal locks, progress writes,
// cancellation and recovery. No client Promise.race or transaction lifetime:
// downloads may hold a transaction while streaming without executing SQL.
function budget(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2147483647) throw new Error(name + " must be a positive integer <= 2147483647.");
  return value;
}
const lockTimeout = budget('DB_LOCK_TIMEOUT_MS', 5000);
const statementTimeout = budget('DB_STATEMENT_TIMEOUT_MS', 30000);
if (lockTimeout >= statementTimeout) throw new Error('DB_LOCK_TIMEOUT_MS must be less than DB_STATEMENT_TIMEOUT_MS.');
const dialectOptions = { lock_timeout: lockTimeout, statement_timeout: statementTimeout,
  connectionTimeoutMillis: 10000, keepAlive: true };
const pool = { acquire: 15000 };
const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required in production.");
}

const sequelize = isProduction
  ? new Sequelize(process.env.DATABASE_URL, {
      dialect: "postgres",
      logging: false,
      pool,
      dialectOptions: {
        ...dialectOptions,
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
        dialectOptions,
        pool,
      },
    );

module.exports = sequelize;
