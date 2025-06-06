import moment from 'moment';
import path from 'path';

import {
  load_json,
  save_json,
  exists_file,
  init_folder,
  file_list,
  delete_json,
} from '../services/file';
import {
  request_company,
  request_company_list,
  INDEX_INFO,
  request_company_all,
} from '../services/request';
import {
  CompanyInfoBlock,
  CompanyResponse,
  DailySimpleModel,
  CompanyResponseAll,
  CompanyBulk,
} from '../types';
import { saveCompress, loadCompress } from './compress';

const MIN_DATE = new Date(2024, 0, 1);

const default_date = {
  start_date: MIN_DATE,
  end_date: moment(new Date()).set({ h: 0, m: 0, s: 0, ms: 0 }).toDate(),
};

async function save_stock(j2: CompanyResponse, _path: string, isSimple: number) {
  if (!isSimple) await save_json(j2, _path);
  else await saveCompress(j2, _path, isSimple === 2);
}

init_folder('data').then(() => {
  init_folder(path.join('data', 'simple'));
  init_folder(path.join('data', 'stock'));
  init_folder(path.join('data', 'bulk')).then(() => {
    file_list(path.join('data', 'bulk')).then((files) => {
      const baseDate = moment(new Date()).add(-LOAD_BULK_COUNT, 'day').toDate();
      files.forEach((f) => {
        if (baseDate.valueOf() > new Date(f.replace('.json', '')).valueOf()) {
          console.log('delete file ', f);
          delete_json(path.join('data', 'bulk', f));
        }
      });
    });
  });
});

export const MIN_DATE_TEXT = `${MIN_DATE.getFullYear()}/${MIN_DATE.getMonth()}/${MIN_DATE.getDay()}`;

export const LOAD_BULK_COUNT = 7;

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function loadStocklistJson(filter: (d: CompanyInfoBlock) => boolean = () => true) {
  const _path = path.join('data', 'list.json');
  const j = (await exists_file(_path)) ? await load_json(_path) : await request_company_list();
  save_json(j, _path);
  //filtering stock!
  const data_all = (j['block1'] as CompanyInfoBlock[]).filter(filter).concat(INDEX_INFO);
  const _path2 = path.join('data', 'last_date.json');
  if (await exists_file(_path2)) {
    const last_dates = await load_json(_path2);
    data_all.forEach((d) => {
      d.lastDate = last_dates[d.full_code];
    });
  } else save_json({}, _path2);
  return data_all;
}

const bulk_cache: Record<string, CompanyBulk> = {};

export async function loadStockJsonBulk(date: Date) {
  const dateStr = ddFormat(date);
  const now = new Date();
  let correctHours;
  if (dateStr === ddFormat(now) && now.getHours() < 18) {
    correctHours = now.getHours();
  } else if (date.valueOf() > now.valueOf()) {
    correctHours = -1;
  }
  console.log(date, correctHours);
  const _path = path.join('data', 'bulk', `${dateStr.replace(/\//gi, '-')}.json`);
  if (!bulk_cache[dateStr] || bulk_cache[dateStr].hours !== correctHours) {
    let j: CompanyBulk | null = null;
    try {
      j = (await load_json(_path)) as CompanyBulk;
      if (j?.hours !== correctHours) throw new Error('hours !== correctHours');
    } catch (e) {
      const res: CompanyResponseAll = await request_company_all(date);
      const result: Record<string, DailySimpleModel> = {};
      res.OutBlock_1.forEach((value) => {
        value.TRD_DD = dateStr;
        /*
                delete (value).CMPPREVDD_PRC
                delete (value).FLUC_TP_CD
                delete (value).ISU_ABBRV
                delete (value).LIST_SHRS
                delete (value).MKTCAP 
                delete (value).MKT_ID
                delete (value).MKT_NM
                delete (value).SECT_TP_NM
                */
        result[value.ISU_SRT_CD] = value;
      });
      j = {
        output: result,
        hours: correctHours,
      };
      save_json(j, _path);
    }
    bulk_cache[dateStr] = j;
  }
  return bulk_cache[dateStr];
}

export async function loadStockJson(
  full_code: string,
  options?: { start_date: Date; end_date: Date; log_datetime: number; isSimple: number }
) {
  options = Object.assign(
    { start_date: default_date.start_date, end_date: default_date.end_date, log_datetime: 0 },
    options
  );
  let _path;
  if (options.isSimple === 2) _path = full_code;
  else {
    const folder = options.isSimple ? 'simple' : 'stock';
    _path = path.join('data', folder, full_code + '.json');
  }
  let success = true;
  let j2: CompanyResponse;
  try {
    if (!options.isSimple) j2 = await load_json(_path);
    else j2 = await loadCompress(_path, options.isSimple === 2);
  } catch (e) {
    success = false;
    j2 = await request_company(full_code, default_date);
    save_stock(j2, _path, options.isSimple);
    j2['_status'] = 0;
    await sleep(200);
  }
  if (success) {
    const output_len = j2['output'].length;
    const last_date = output_len
      ? new Date(j2['output'][0]['TRD_DD'])
      : moment(options.start_date).add(1, 'day').toDate();
    if (options.log_datetime) console.log(options.start_date, last_date, options.end_date);
    if (output_len === 0) {
      j2 = (await request_company(full_code, default_date)) as any;
      save_stock(j2, _path, options.isSimple);
      j2['_status'] = 2;
      await sleep(200);
    } else if (
      options.start_date.valueOf() < last_date.valueOf() &&
      last_date.valueOf() <= options.end_date.valueOf()
    ) {
      let j3: CompanyResponse;
      if (options.isSimple) {
        let _date = last_date;
        const output: DailySimpleModel[] = [];
        const shortCode = full_code.slice(3, 9);
        while (_date.valueOf() <= options.end_date.valueOf()) {
          const cache = bulk_cache[ddFormat(_date)];
          // console.log('@@', shortCode, cache?1:0, (cache || {})[shortCode])
          if (!(cache && cache.output[shortCode])) {
            if (cache && cache.hours === -1) {
              _date = moment(_date).add(1, 'day').toDate();
              continue;
            }
            break;
          }
          if (cache.output[shortCode].TDD_CLSPRC !== '-') output.push(cache.output[shortCode]);
          _date = moment(_date).add(1, 'day').toDate();
        }
        if (_date.valueOf() <= options.end_date.valueOf())
          j3 = await request_company(full_code, {
            start_date: last_date,
            end_date: options.end_date,
          });
        else {
          // console.log('use bulk: ', full_code)
          j3 = {
            _status: 4,
            output: output.reverse(),
            CURRENT_DATETIME: j2['CURRENT_DATETIME'],
          };
        }
      } else
        j3 = await request_company(full_code, {
          start_date: last_date,
          end_date: options.end_date,
        });
      j2['output'] = j3['output'].concat(j2['output'].slice(1));
      j2['CURRENT_DATETIME'] = j3['CURRENT_DATETIME'];
      save_stock(j2, _path, options.isSimple);
      if (j3['_status'] === 4) j2['_status'] = 4;
      else {
        j2['_status'] = 3;
        await sleep(200);
      }
    } else j2['_status'] = 1;
  }
  return j2;
}

export async function saveLastDate(data_all: any[]) {
  const last_dates: any = {};
  data_all.forEach((d) => {
    last_dates[d['full_code']] = d['lastDate'];
  });
  const _path2 = path.join('data', 'last_date.json');
  await save_json(last_dates, _path2);
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
