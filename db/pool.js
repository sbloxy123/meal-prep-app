const { Pool } = require("pg");

module.exports = new Pool(
    process.env.DATABASE_URL
        ? {
              connectionString: process.env.DATABASE_URL,
              ssl: { rejectUnauthorized: false },
          }
        : {
              host: process.env.HOST,
              user: process.env.USER,
              database: process.env.DATABASE,
              password: process.env.PASSWORD,
              port: process.env.DATABASE_PORT,
          },
);
