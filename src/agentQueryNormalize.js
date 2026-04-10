/**
 * OpenClaw / Agent 侧查询参数归一化，与 buildControlApi 行为一致。
 */

export function trimQuery(v) {
  if (v == null) return '';
  return String(v).trim();
}

/** 中文/别名 → 网关 market；symbol 去空格 */
export function normalizeTickerQuery(query = {}) {
  const raw = trimQuery(query.market);
  const lower = raw.toLowerCase();
  const cn = {
    A股: 'a',
    a股: 'a',
    沪深: 'a',
    上证: 'a',
    深市: 'a',
    港股: 'hk',
    港交所: 'hk',
    加密: 'crypto',
    数字货币: 'crypto',
    虚拟货币: 'crypto',
    比特币: 'crypto'
  };
  let market = cn[raw] || lower;
  if (market === 'hongkong' || market === 'hong kong') market = 'hk';
  if (market === 'btc' || market === 'crypto-currency') market = 'crypto';
  const symbol = trimQuery(query.symbol);
  const out = { market, symbol };
  const seg = query.segment != null ? trimQuery(query.segment) : '';
  if (seg) out.segment = seg;
  return out;
}

export function normalizeKeywordTableQuery(query = {}, label) {
  const q = { ...(query || {}) };
  const k = trimQuery(q.keyword);
  const qq = trimQuery(q.q);
  const text = k || qq;
  if (!text) {
    throw new Error(
      `${label} requires keyword or q (search text). If user only gave a name, put it in keyword.`
    );
  }
  q.keyword = text;
  delete q.q;
  return q;
}

export function normalizeFundBasicTableQuery(query = {}) {
  const q = { ...(query || {}) };
  const tc = trimQuery(q.ts_code ?? q.tsCode);
  if (tc) {
    const out = { ...q, ts_code: tc };
    delete out.tsCode;
    delete out.keyword;
    delete out.q;
    return out;
  }
  return normalizeKeywordTableQuery(q, 'searchFundBasic');
}

export function normalizeTradeCalendarQuery(query = {}) {
  const q = { ...(query || {}) };
  const start = trimQuery(q.start_date ?? q.startDate);
  const end = trimQuery(q.end_date ?? q.endDate);
  const ex = trimQuery(q.exchange);
  if (!ex) {
    throw new Error(
      'queryTradeCalendar requires exchange (SSE=上交所, SZSE=深交所, 等，与网关一致)'
    );
  }
  if (!start || !end) {
    throw new Error(
      'queryTradeCalendar requires start_date and end_date as YYYY-MM-DD (or startDate/endDate)'
    );
  }
  const out = { ...q, exchange: ex, start_date: start, end_date: end };
  delete out.startDate;
  delete out.endDate;
  return out;
}
