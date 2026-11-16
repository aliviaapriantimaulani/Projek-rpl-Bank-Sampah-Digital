require('dotenv').config();
const path = require('path');
const fs = require('fs');

const connectionType = process.env.DB_CONNECTION || 'sqlite';

// Ensure data directory exists for SQLite
if (connectionType === 'sqlite') {
  const dataDir = path.resolve(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

const sqliteFilename = path.resolve(
  __dirname,
  process.env.DB_SQLITE_FILENAME || './data/banksampah.sqlite'
);

const config = {
  development: {
    client: connectionType === 'mysql' ? 'mysql2' : 'sqlite3',
    connection:
      connectionType === 'mysql'
        ? {
            host: process.env.DB_HOST || '127.0.0.1',
            port: Number(process.env.DB_PORT) || 3306,
            database: process.env.DB_DATABASE || 'bank_sampah_digital',
            user: process.env.DB_USERNAME || 'root',
            password: process.env.DB_PASSWORD || '',
          }
        : {
            filename: sqliteFilename,
          },
    useNullAsDefault: true,
    pool:
      connectionType === 'sqlite'
        ? {
            min: 1,
            max: 5,
            acquireTimeoutMillis: 10000,
            afterCreate: (conn, cb) => {
              conn.run('PRAGMA journal_mode = WAL;', () => {
                conn.run('PRAGMA foreign_keys = ON;', cb);
              });
            },
          }
        : { min: 2, max: 10 },
    migrations: {
      directory: path.resolve(__dirname, 'src/database/migrations'),
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: path.resolve(__dirname, 'src/database/seeds'),
    },
  },
  production: {
    client: connectionType === 'mysql' ? 'mysql2' : 'sqlite3',
    connection:
      connectionType === 'mysql'
        ? {
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT) || 3306,
            database: process.env.DB_DATABASE,
            user: process.env.DB_USERNAME,
            password: process.env.DB_PASSWORD,
          }
        : {
            filename: sqliteFilename,
          },
    useNullAsDefault: true,
    migrations: {
      directory: path.resolve(__dirname, 'src/database/migrations'),
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: path.resolve(__dirname, 'src/database/seeds'),
    },
  },
  test: {
    client: 'sqlite3',
    connection: {
      filename: ':memory:',
    },
    useNullAsDefault: true,
    pool: {
      afterCreate: (conn, cb) => {
        conn.run('PRAGMA foreign_keys = ON;', cb);
      },
    },
    migrations: {
      directory: path.resolve(__dirname, 'src/database/migrations'),
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: path.resolve(__dirname, 'src/database/seeds'),
    },
  },
};

module.exports = config;
