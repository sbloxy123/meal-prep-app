const { Pool } = require("pg");

// const isProduction = process.env.NODE_ENV === "production";

module.exports = new Pool(
    // isProduction
    //     ? {
    //           connectionString: process.env.DATABASE_URL,
    //           ssl: { rejectUnauthorized: false },
    //       }
    //     :
    {
        host: process.env.HOST,
        user: process.env.USER,
        database: process.env.DATABASE,
        password: process.env.PASSWORD,
        port: process.env.DATABASE_PORT,
    },
);
