export async function testOpfs() {
  const root = await navigator.storage.getDirectory();
  console.log(root);
}
