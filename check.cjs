const db = require('better-sqlite3')('vault.db');
const users = db.prepare('SELECT id, username FROM users LIMIT 5').all();
console.log(users);
