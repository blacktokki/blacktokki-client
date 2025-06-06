import fs from 'fs';

export async function save_json(data: any, _path: string) {
  fs.writeFile(_path, JSON.stringify(data), 'utf8', (err) => {
    if (err) console.log(err);
  });
}

export async function load_json(_path: string) {
  const data = await fs.promises.readFile(_path, 'utf8');
  // console.log(_path, data.length)
  return JSON.parse(data);
}

export async function delete_json(_path: string) {
  await fs.promises.unlink(_path);
}

export async function exists_file(_path: string) {
  return fs.existsSync(_path);
}

export async function init_folder(_path: string) {
  if (!(await exists_file(_path))) {
    await fs.promises.mkdir(_path);
  }
}

export async function file_list(_path: string) {
  return await fs.promises.readdir(_path);
}
