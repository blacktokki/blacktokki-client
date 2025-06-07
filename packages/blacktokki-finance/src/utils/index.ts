import * as mathjs from 'mathjs';

import { DailySimpleModel } from '../types';

export const printList = (list: any[], page: number = 1) => {
  const end = page * 100;
  for (let i = (page - 1) * 100; i < end; i++) {
    console.log(i, JSON.stringify(list[i]));
  }
};

export function createEntries<T>(
  outputs: DailySimpleModel[][],
  callback: (
    v: Record<number, DailySimpleModel>,
    i: number,
    arr: Record<number, DailySimpleModel>[]
  ) => T
) {
  const keys = new Set<string>();
  outputs.forEach((output) => output.forEach((v) => keys.add(v.TRD_DD)));
  const record = Object.fromEntries(
    [...keys].map((v) => [v, {} as Record<number, DailySimpleModel>])
  );
  outputs.forEach((output, i) =>
    output.forEach((v) => {
      record[v.TRD_DD][i] = v;
    })
  );
  const values = Object.values(record);
  const result = Object.entries(record)
    .map(([k, v], i) => {
      try {
        return [k, callback(v, i, values)] as [string, T];
      } catch (e) {
        return undefined;
      }
    })
    .filter((v) => v !== undefined);
  return Object.assign(result, { values: () => result.map((v) => v[1]) });
}

export function trdval_filter(data: DailySimpleModel[], trdval_days: number, min_trdval: number) {
  let trd_val_sum = 0;
  let trd_val_cnt = 0;
  for (const d of data) {
    trd_val_sum += parseInt(d['ACC_TRDVAL'].replace(',', ''), 10);
    trd_val_cnt += 1;
    if (trd_val_cnt === trdval_days) break;
  }
  return trd_val_sum > min_trdval;
}

export function sharp(values: number[]) {
  if (values.length === 0) {
    return -100;
  }
  return mathjs.sum(values) / values.length / mathjs.std(...values);
}
