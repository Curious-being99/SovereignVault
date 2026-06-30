const http = require('http');

const req = http.request({
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/files/323',
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-User-Id': '1'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('STATUS:', res.statusCode, 'BODY:', data));
});

req.write(JSON.stringify({
  folderPath: '/Trash/test',
  deletedAt: Date.now(),
  originalFolderPath: '/'
}));
req.on('error', e => console.error(e));
req.end();
