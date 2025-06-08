import moment from 'moment';
import path from 'path';

import { CompanyInfoBlock, CompanyResponse } from '../types';
import { saveCompress, loadCompress } from '../utils/compress';
import { load_json, save_json, exists_file, init_folder } from './file';
import { request_company, request_company_list, INDEX_INFO } from './request';

const MIN_DATE = moment(new Date()).add(-2, 'year').add(1, 'day').toDate();

const default_date = {
  start_date: MIN_DATE,
  end_date: moment(new Date()).set({ h: 0, m: 0, s: 0, ms: 0 }).toDate(),
};

const MAX_LOAD_STOCK = 200;
const MAX_RELOAD_STOCK = 200;

async function save_stock(j2: CompanyResponse, _path: string, isSimple: number) {
  if (!isSimple) await save_json(j2, _path);
  else await saveCompress(j2, _path, isSimple === 2);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function storage({
  root,
  listBld,
  listRoot,
  bulkBld,
  oneBld,
  filter = () => true,
  indexFilter = () => false,
}: {
  root: string;
  listBld: string;
  listRoot: string;
  bulkBld: string;
  oneBld: string;
  filter?: (d: CompanyInfoBlock) => boolean;
  indexFilter?: (d: CompanyInfoBlock) => boolean;
}) {
  const rootPath = path.join('data', root);
  const syncContext = {
    sync_lock: 0,
  };

  init_folder('data').then(() =>
    init_folder(rootPath).then(() => {
      init_folder(path.join(rootPath, 'simple'));
      init_folder(path.join(rootPath, 'stock'));
    })
  );

  async function sync(option?: {
    setter: (data_all: CompanyInfoBlock[]) => void;
    verbose: boolean;
  }) {
    if (option === undefined) {
      return await sync({ setter: () => {}, verbose: true });
    }
    if (syncContext.sync_lock === 0) {
      let current_load_stock = 0;
      syncContext.sync_lock = 1;
      let reload_stock = 0;
      const data_all = await loadListJson();
      data_all.forEach((item) => {
        item.checked = false;
      });
      let new_data_all: CompanyInfoBlock[] = data_all.map((item) => item);
      option.setter(new_data_all);
      const reload = async () => {
        option.setter(new_data_all);
        console.log(root, 'reloading...');
        reload_stock = 0;
        await saveLastDate(new_data_all);
      };
      const endDate = moment(new Date()).set({ h: 0, m: 0, s: 0, ms: 0 }).toDate();
      while (current_load_stock > 0) await sleep(50);
      for (const [i, d] of data_all.entries()) {
        const full_code = d.ISU_CD;
        reload_stock += 1;
        while (syncContext.sync_lock === 2) await sleep(50);
        while (current_load_stock >= MAX_LOAD_STOCK || reload_stock >= MAX_RELOAD_STOCK) {
          await sleep(200);
          if (reload_stock === MAX_RELOAD_STOCK) {
            new_data_all = data_all.map((item) => item); // array.slice(0)
            await reload();
          } else {
            reload_stock += 1;
          }
          console.log(root, current_load_stock, '/', MAX_LOAD_STOCK);
        }
        current_load_stock += 1;
        loadJson(full_code, {
          ...default_date,
          log_datetime: 0,
          isSimple: 1,
        }).then(async (j2: CompanyResponse) => {
          if (option.verbose && j2._status !== 1) {
            console.log(root, i, d.ISU_ABBRV, d.ISU_CD, j2._status);
          }
          data_all[i].checked = true;
          data_all[i].lastDate = j2.output[0].TRD_DD || data_all[i].lastDate || ddFormat(endDate);
          current_load_stock -= 1;
        });
      }
      while (current_load_stock > 0) await sleep(50);
      new_data_all = data_all.map((item) => item);
      await reload();
    }
  }

  async function loadListJson() {
    const _path = path.join(rootPath, 'list.json');
    const j = (await exists_file(_path))
      ? await load_json(_path)
      : await request_company_list(listBld);
    save_json(j, _path);
    //filtering stock!
    const data_all = (j[listRoot] as CompanyInfoBlock[])
      .filter(
        (d) => d.ISU_CD.substring(8, 11) === '000' && d.ISU_ABBRV.search('스팩') < 0 && filter(d)
      )
      .concat(INDEX_INFO.filter(indexFilter));
    const _path2 = path.join(rootPath, 'last_date.json');
    if (await exists_file(_path2)) {
      const last_dates = await load_json(_path2);
      data_all.forEach((d) => {
        d.lastDate = last_dates[d.ISU_CD];
      });
    } else save_json({}, _path2);
    return data_all;
  }

  async function loadJson(
    full_code: string,
    options: { start_date: Date; end_date: Date; log_datetime: number; isSimple: number }
  ) {
    let _path;
    if (options.isSimple === 2) _path = full_code;
    else {
      const folder = options.isSimple ? 'simple' : 'stock';
      _path = path.join(rootPath, folder, full_code + '.json');
    }
    let success = true;
    let j2: CompanyResponse;
    try {
      if (!options.isSimple) j2 = await load_json(_path);
      else j2 = await loadCompress(_path, options.isSimple === 2);
    } catch (e) {
      success = false;
      j2 = await request_company(oneBld, full_code, default_date);
      save_stock(j2, _path, options.isSimple);
      j2['_status'] = 0;
      await sleep(200);
    }
    if (success) {
      const output_len = j2['output'].length;
      const last_date = output_len
        ? new Date(j2['CURRENT_DATETIME'])
        : moment(options.start_date).add(1, 'day').toDate();
      if (options.log_datetime) console.log(options.start_date, last_date, options.end_date);
      if (output_len === 0 || last_date.valueOf() <= options.end_date.valueOf()) {
        j2 = (await request_company(oneBld, full_code, default_date)) as any;
        save_stock(j2, _path, options.isSimple);
        j2['_status'] = 2;
        await sleep(200);
      } else {
        j2['_status'] = 1;
      }
    }
    return j2;
  }

  async function saveLastDate(data_all: any[]) {
    const last_dates: any = {};
    data_all.forEach((d) => {
      last_dates[d['full_code']] = d['lastDate'];
    });
    const _path2 = path.join(rootPath, 'last_date.json');
    await save_json(last_dates, _path2);
  }

  async function call(shortCode: string) {
    const fullCode = (
      (await loadListJson()).find((v) => v.ISU_SRT_CD === shortCode) as CompanyInfoBlock
    ).ISU_CD;
    return fullCode
      ? await loadJson(fullCode, { ...default_date, isSimple: 1, log_datetime: 0 })
      : undefined;
  }

  async function batch<T>(
    blockFilter: (v: CompanyInfoBlock) => boolean,
    map: (company: CompanyInfoBlock, v: CompanyResponse) => T | undefined
  ) {
    const results: T[] = [];
    for (const block of (await loadListJson()).filter(blockFilter)) {
      const result = map(
        block,
        await loadJson(block.ISU_CD, { ...default_date, isSimple: 1, log_datetime: 0 })
      );
      if (result) results.push(result);
    }
    return results;
  }

  return Object.assign(call, { sync, batch, list: loadListJson });
}

export function ddFormat(date: Date) {
  return (
    date.getFullYear().toString() +
    '/' +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    '/' +
    date.getDate().toString().padStart(2, '0')
  );
}

export const kospiStorage = storage({
  root: 'kospi',
  listBld: 'dbms/MDC/STAT/standard/MDCSTAT01901',
  bulkBld: 'dbms/MDC/STAT/standard/MDCSTAT01501',
  oneBld: 'dbms/MDC/STAT/issue/MDCSTAT23902',
  listRoot: 'OutBlock_1',
  filter: (d) => d.MKT_TP_NM === 'KOSPI',
  indexFilter: (d) => d.MKT_TP_NM === 'KOSPI',
});

export const kosdaqStorage = storage({
  root: 'kosdaq',
  listRoot: 'OutBlock_1',
  listBld: 'dbms/MDC/STAT/standard/MDCSTAT01901',
  bulkBld: 'dbms/MDC/STAT/standard/MDCSTAT01501',
  oneBld: 'dbms/MDC/STAT/issue/MDCSTAT23902',
  filter: (d) => d.MKT_TP_NM === 'KOSDAQ',
  indexFilter: (d) => d.MKT_TP_NM === 'KOSDAQ',
});

export const etfStorage = storage({
  root: 'etf',
  listRoot: 'output',
  listBld: 'dbms/MDC/STAT/standard/MDCSTAT04601',
  bulkBld: 'dbms/MDC/STAT/standard/MDCSTAT04301',
  oneBld: 'dbms/MDC/STAT/standard/MDCSTAT04501',
});

export const MIN_DATE_TEXT = `${MIN_DATE.getFullYear()}/${MIN_DATE.getMonth()}/${MIN_DATE.getDay()}`;
