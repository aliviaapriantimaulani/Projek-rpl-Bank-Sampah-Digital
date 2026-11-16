const knex = require('knex');
const knexConfig = require('../../knexfile');
const env = require('./env');

const environment = env.NODE_ENV === 'test' ? 'test' : 'development';
const config = knexConfig[environment];

const db = knex(config);

module.exports = db;
