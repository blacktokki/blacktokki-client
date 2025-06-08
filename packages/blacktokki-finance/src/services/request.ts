import axios from 'axios';

import { CompanyInfoBlock, DailySimpleModel } from '../types';

const headers = {
  'User-Agent': 'Chrome/78.0.3904.87 Safari/537.36',
  Referer: 'http://data.krx.co.kr/',
};

export async function request_company_list(bld: string) {
  const params = new URLSearchParams();
  const data = {
    bld,
    mktId: 'ALL',
    share: '1',
    csvxls_isNo: 'false',
  };
  Object.keys(data).map((key) => params.append(key, (data as any)[key]));

  return (
    await axios.post('http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd', params, { headers })
  ).data;
}

function dd_format(date: Date) {
  //defferent ddFormat!
  return (
    date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0')
  );
}

const MAX_REQUESTS_COUNT = 4;
const INTERVAL_MS = 500;
let PENDING_REQUESTS = 0;
const companyApi = axios.create({ headers });
companyApi.interceptors.request.use(function (config) {
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      if (PENDING_REQUESTS < MAX_REQUESTS_COUNT) {
        PENDING_REQUESTS++;
        clearInterval(interval);
        setTimeout(() => {
          PENDING_REQUESTS--;
        }, INTERVAL_MS);
        resolve(config);
      }
    }, INTERVAL_MS);
  });
});

export const INDEX_INFO: CompanyInfoBlock[] = [
  {
    ISU_ABBRV: '코스피',
    ISU_CD: '_KOSPI',
    lastDate: '',
    MKT_TP_NM: 'KOSPI',
    ISU_SRT_CD: '1',
  },
  {
    ISU_ABBRV: '코스닥',
    ISU_CD: '_KOSDAQ',
    lastDate: '',
    MKT_TP_NM: 'KOSDAQ',
    ISU_SRT_CD: '2',
  },
];

export async function request_company(
  bld: string,
  full_code: string,
  options: { start_date: Date; end_date: Date } = {
    start_date: new Date(1990, 1, 1),
    end_date: new Date(2100, 1, 1),
  }
) {
  const index = INDEX_INFO.find((v) => v.ISU_CD === full_code);
  if (index) {
    return await request_index(index.ISU_SRT_CD, options);
  }
  const params = new URLSearchParams();
  const data = {
    bld,
    isuCd: full_code,
    isuCd2: '',
    strtDd: dd_format(options.start_date),
    endDd: dd_format(options.end_date),
    share: '1',
    money: '1',
    csvxls_isNo: 'false',
  };
  Object.keys(data).map((key) => params.append(key, (data as any)[key]));
  const _data = (
    await companyApi.post('http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd', params)
  ).data;
  // ADJ_CLSPRC
  const _data2 = (
    (
      await axios.get(
        'https://fchart.stock.naver.com/sise.nhn?timeframe=day&count=6000&requestType=0&symbol=' +
          full_code.slice(3, 9)
      )
    ).data as string
  )
    .match(/<item data="(.*?)" \/>/gi)
    ?.reduce((prev, value) => {
      const d = value.replace(/(<item data="|" \/>)/gi, '').split('|');
      prev[d[0]] = d;
      return prev;
    }, {} as Record<string, string[]>);
  if (_data2) {
    (_data['output'] as DailySimpleModel[]).forEach((value) => {
      const adjPrc = _data2[dd_format(new Date(value['TRD_DD']))];
      value['TDD_OPNPRC'] = adjPrc[1];
      value['TDD_HGPRC'] = adjPrc[2];
      value['TDD_LWPRC'] = adjPrc[3];
      value['TDD_CLSPRC'] = adjPrc[4];
    });
  }
  return _data;
}

async function request_index(
  code: string,
  options: { start_date: Date; end_date: Date } = {
    start_date: new Date(1990, 1, 1),
    end_date: new Date(2100, 1, 1),
  }
) {
  const params = new URLSearchParams();
  const data = {
    bld: 'dbms/MDC/STAT/standard/MDCSTAT00301',
    indIdx: code,
    indIdx2: '001',
    strtDd: dd_format(options.start_date),
    endDd: dd_format(options.end_date),
    share: '1',
    money: '1',
    csvxls_isNo: 'false',
  };
  Object.keys(data).map((key) => params.append(key, (data as any)[key]));
  const _data = (
    await companyApi.post('http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd', params)
  ).data;
  const mapper: [string, string][] = [
    ['UPDN_RATE', 'FLUC_RT'],
    ['CLSPRC_IDX', 'TDD_CLSPRC'],
    ['OPNPRC_IDX', 'TDD_OPNPRC'],
    ['HGPRC_IDX', 'TDD_HGPRC'],
    ['LWPRC_IDX', 'TDD_LWPRC'],
    ['PRV_DD_CMPR', 'CMPPRVDD_PRC'],
  ];
  _data['output'].forEach((d: any) => {
    mapper.forEach((m) => {
      d[m[1]] = d[m[0]];
      delete d[m[0]];
    });
  });
  return _data;
}
