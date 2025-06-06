export type DailyCompressModel = [string, string, string, string, string, string, string, string];

export type DailySimpleModel = {
  TRD_DD: string; // Date, 날짜
  TDD_CLSPRC: string; //Close, 종가
  TDD_OPNPRC: string; //'Open', 시가
  TDD_HGPRC: string; //High, 고가
  TDD_LWPRC: string; //Lower, 저가
  ACC_TRDVOL: string; //Volume, 거래량
  ACC_TRDVAL: string; //Amount, 거래대금
  FLUC_RT: string; //ChangeRate, 등락률
};

export type DailyFullModel = DailySimpleModel & {
  ISU_CD: string; // Code, 코드
  ISU_NM: string; // Name, 종목명
  MKT_NM: string; //Market, 시장
  SECUGRP_NM: string; //SecuGroup, ?
  FLUC_TP_CD: string; //UpDown, 등락
  CMPPRVDD_PRC: string; //Change, 대비
  MKTCAP: string; //MarCap, 시가총액
};

export type CompanyCompress = {
  _status: number;
  output: DailyCompressModel[];
  CURRENT_DATETIME: string;
};

export type CompanyResponse = {
  _status: number;
  output: (DailySimpleModel | DailyFullModel)[];
  CURRENT_DATETIME: string;
};

export type CompanyResponseAll = {
  OutBlock_1: (DailySimpleModel & { ISU_SRT_CD: string })[];
  CURRENT_DATETIME: string;
};

export type CompanyBulk = {
  output: Record<string, DailySimpleModel>;
  hours?: number;
};

export type CompanyInfoBlock = {
  marketCode: string;
  full_code: string;
  codeName: string;
  lastDate: string;
  short_code: string;
  checked?: boolean;
  traded?: boolean;
};
