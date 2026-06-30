async function run() {
  const res = await fetch('http://127.0.0.1:3000/api/files/323', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': '1'
    },
    body: JSON.stringify({
      folderPath: '/Trash/test',
      deletedAt: Date.now(),
      originalFolderPath: '/'
    })
  });
  console.log('STATUS:', res.status);
  console.log('BODY:', await res.text());
}
run();
