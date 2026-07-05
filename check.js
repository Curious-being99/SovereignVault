const db = require('better-sqlite3')('storage.db');
const files = db.prepare('SELECT id, userId, name, dagHash, dagSignature, previousDagHash, merkleRoot FROM files').all();
console.log(files);
