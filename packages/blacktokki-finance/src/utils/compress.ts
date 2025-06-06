import { load_json, save_json } from '../services/file';
import { CompanyResponse, DailySimpleModel, DailyCompressModel, CompanyCompress } from '../types';
// import sqlite3 from 'sqlite3'

export const simpleModelKeys: (keyof DailySimpleModel)[] = [
  'TRD_DD',
  'TDD_CLSPRC',
  'TDD_OPNPRC',
  'TDD_HGPRC',
  'TDD_LWPRC',
  'ACC_TRDVOL',
  'ACC_TRDVAL',
  'FLUC_RT',
];

export async function saveCompress(
  data: CompanyResponse | CompanyCompress,
  _path: string,
  dbmode: boolean
) {
  const output = data['output'];
  data['output'] = (data as CompanyResponse)['output'].map((item) => {
    return simpleModelKeys.reduce((prev, current) => {
      prev.push(item[current]);
      return prev;
    }, [] as unknown as DailyCompressModel);
  });
  if (dbmode) {
    // let db = new sqlite3.Database('./db/stock.db')
  } else await save_json(data, _path);
  data['output'] = output;
}

async function _loadDB(_path: string) {}

export async function loadCompress(_path: string, dbmode: boolean) {
  const data: CompanyCompress | CompanyResponse = dbmode
    ? await _loadDB(_path)
    : await load_json(_path);
  data['output'] = (data as CompanyCompress)['output'].map((item) => {
    return simpleModelKeys.reduce((prev, current, index) => {
      prev[current] = item[index];
      return prev;
    }, {} as DailySimpleModel);
  });
  return data as CompanyResponse;
}
