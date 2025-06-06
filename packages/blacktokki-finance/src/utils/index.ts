import moment from 'moment';

import { CompanyInfoBlock, CompanyResponse } from '../types';
import {
  MIN_DATE_TEXT,
  ddFormat,
  LOAD_BULK_COUNT,
  loadStockJson,
  loadStockJsonBulk,
  loadStocklistJson,
  saveLastDate,
  sleep,
} from './storage';

const MAX_LOAD_STOCK = 400;
const MAX_RELOAD_STOCK = 400;

const syncContext = {
  sync_lock: 0,
};

export { loadStocklistJson, loadStockJson } from './storage';

export const printList = (list: any[]) => {
  for (const item of list) {
    console.log(item);
  }
};

export async function sync_stock(option?: {
  setter: (data_all: CompanyInfoBlock[]) => void;
  verbose: boolean;
}) {
  if (option === undefined) {
    return await sync_stock({ setter: () => {}, verbose: true });
  }
  if (syncContext.sync_lock === 0) {
    let current_load_stock = 0;
    syncContext.sync_lock = 1;
    let reload_stock = 0;
    const data_all = await loadStocklistJson((d: CompanyInfoBlock) => {
      return (
        ['KSQ', 'STK'].indexOf(d.marketCode) >= 0 &&
        d.full_code[2] === '7' &&
        d.full_code.substring(8, 11) === '000' &&
        d.codeName.search('스팩') < 0
      );
    });
    data_all.forEach((item) => {
      item.checked = false;
    });
    let new_data_all: CompanyInfoBlock[] = data_all.map((item) => item);
    option.setter(new_data_all);
    const reload = async () => {
      option.setter(new_data_all);
      console.log('reload!!!!');
      reload_stock = 0;
      await saveLastDate(new_data_all);
    };
    const endDate = moment(new Date()).set({ h: 0, m: 0, s: 0, ms: 0 }).toDate();
    let _date = moment(endDate)
      .add(1 - LOAD_BULK_COUNT, 'day')
      .toDate();
    while (_date.valueOf() <= endDate.valueOf()) {
      current_load_stock += 1;
      loadStockJsonBulk(_date)
        .then((data) => {
          current_load_stock -= 1;
        })
        .catch((e) => {
          console.log('error: ', e);
        });
      _date = moment(_date).add(1, 'day').toDate();
    }
    while (current_load_stock > 0) await sleep(50);
    for (const [i, d] of data_all.entries()) {
      const full_code = d.full_code;
      reload_stock += 1;
      while (syncContext.sync_lock === 2) await sleep(50);
      while (current_load_stock >= MAX_LOAD_STOCK || reload_stock >= MAX_RELOAD_STOCK) {
        await sleep(50);
        if (reload_stock === MAX_RELOAD_STOCK) {
          new_data_all = data_all.map((item) => item); // array.slice(0)
          await reload();
        } else {
          reload_stock += 1;
        }
        console.log(current_load_stock, '/', MAX_LOAD_STOCK);
      }
      current_load_stock += 1;
      loadStockJson(full_code, {
        start_date: new Date(2016, 0, 1),
        end_date: endDate,
        log_datetime: 0,
        isSimple: 1,
      }).then(async (j2: CompanyResponse) => {
        if (option.verbose) {
          if (j2._status === 0) {
            console.log(i, d.codeName, d.full_code);
            console.log(j2.output.length ? j2.output[0] : null);
          } else {
            console.log(i, d.codeName, d.full_code, j2._status);
          }
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

export function trdval_filter(data: any, trdval_days: number, min_trdval: number) {
  let trd_val_sum = 0;
  let trd_val_cnt = 0;
  for (const d of data['output']) {
    trd_val_sum += parseInt((d as any)['ACC_TRDVAL'].replace(',', ''), 10);
    trd_val_cnt += 1;
    if (trd_val_cnt === trdval_days) break;
  }
  return trd_val_sum > min_trdval;
}

export function avg_and_var(record2: Record<string, number>, length: number, lastDateStr: string) {
  let j2_sum = 0.0;
  let j2_pow_sum = 0.0;
  let cnt = 0;
  for (let date = moment(new Date(lastDateStr)); cnt < length; date.add(-1, 'day')) {
    const dateStr = ddFormat(date.toDate());
    const value2 = record2[dateStr];
    if (value2 !== undefined) {
      j2_sum += value2;
      j2_pow_sum += value2 * value2;
      cnt += 1;
    }
    if (dateStr === MIN_DATE_TEXT) break;
  }
  if (cnt && j2_sum !== 0) {
    const j2_avg = j2_sum / cnt;
    const j2_var = j2_pow_sum / cnt - j2_avg * j2_avg;
    return [j2_avg, j2_var];
  }
  return [null, null];
}

export function cov_and_var(
  record2: Record<string, number>,
  record3: Record<string, number>,
  length: number,
  lastDateStr: string
) {
  let j3_sum = 0.0;
  let j3_pow_sum = 0.0;
  let j2_sum = 0.0;
  let j2_pow_sum = 0.0;
  let cov_sum = 0.0;
  let cov_cnt = 0;

  for (let date = moment(new Date(lastDateStr)); cov_cnt < length; date.add(-1, 'day')) {
    const dateStr = ddFormat(date.toDate());
    const value2 = record2[dateStr],
      value3 = record3[dateStr];
    if (value2 !== undefined && value3 !== undefined) {
      j2_sum += value2;
      j2_pow_sum += value2 * value2;
      j3_sum += value3;
      j3_pow_sum += value3 * value3;
      cov_sum += value2 * value3;
      cov_cnt += 1;
    }
    if (dateStr === MIN_DATE_TEXT) break;
  }
  if (cov_cnt && j2_sum !== 0 && j3_sum !== 0) {
    const j2_avg = j2_sum / cov_cnt;
    const j3_avg = j3_sum / cov_cnt;
    const cov = cov_sum / cov_cnt - j3_avg * j2_avg;
    const j2_var = j2_pow_sum / cov_cnt - j2_avg * j2_avg;
    const j3_var = j3_pow_sum / cov_cnt - j3_avg * j3_avg;
    return [cov, j2_var, j3_var];
  }
  return [null, null, null];
}
