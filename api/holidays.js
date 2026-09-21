const OFFICIAL_2026 = [
  ["2026-01-01", "신정"],
  ["2026-02-16", "설날 연휴"],
  ["2026-02-17", "설날"],
  ["2026-02-18", "설날 연휴"],
  ["2026-03-01", "3·1절"],
  ["2026-03-02", "대체공휴일(3·1절)"],
  ["2026-05-05", "어린이날"],
  ["2026-05-24", "부처님오신날"],
  ["2026-05-25", "대체공휴일(부처님오신날)"],
  ["2026-06-03", "지방선거일"],
  ["2026-06-06", "현충일"],
  ["2026-08-15", "광복절"],
  ["2026-08-17", "대체공휴일(광복절)"],
  ["2026-09-24", "추석 연휴"],
  ["2026-09-25", "추석"],
  ["2026-09-26", "추석 연휴"],
  ["2026-10-03", "개천절"],
  ["2026-10-05", "대체공휴일(개천절)"],
  ["2026-10-09", "한글날"],
  ["2026-12-25", "성탄절"],
].map(([date, name]) => ({ date, name }));

const FIXED_HOLIDAYS = [
  ["01-01", "신정", "새해"],
  ["03-01", "3·1절", "3·1절"],
  ["05-05", "어린이날", "어린이날"],
  ["06-06", "현충일", "현충일"],
  ["08-15", "광복절", "광복절"],
  ["10-03", "개천절", "개천절"],
  ["10-09", "한글날", "한글날"],
  ["12-25", "성탄절", "크리스마스"],
];

const ALLOWED_NAMES = new Map([
  ["새해", "신정"],
  ["설날", "설날 연휴"],
  ["3·1절", "3·1절"],
  ["어린이날", "어린이날"],
  ["부처님 오신 날", "부처님오신날"],
  ["부처님오신날", "부처님오신날"],
  ["현충일", "현충일"],
  ["광복절", "광복절"],
  ["추석", "추석 연휴"],
  ["개천절", "개천절"],
  ["한글날", "한글날"],
  ["크리스마스", "성탄절"],
  ["기독탄신일", "성탄절"],
]);

function mergeHolidays(items) {
  const unique = new Map();
  items.forEach((item) => {
    if (!item?.date || !item?.name) return;
    unique.set(`${item.date}|${item.name}`, { date: item.date, name: item.name });
  });
  return [...unique.values()].sort((left, right) => left.date.localeCompare(right.date) || left.name.localeCompare(right.name, "ko"));
}

function normalizeUpstreamHoliday(item, year) {
  const localName = String(item?.localName || "").trim();
  const name = ALLOWED_NAMES.get(localName);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(String(item?.date || ""))) return null;
  const fixed = FIXED_HOLIDAYS.find(([, , upstreamName]) => upstreamName === localName);
  if (fixed && item.date !== `${year}-${fixed[0]}`) return { date: item.date, name: `대체공휴일(${fixed[1]})` };
  return { date: item.date, name };
}

export default async function handler(request, response) {
  if (request.method !== "GET") return response.status(405).json({ error: "Method not allowed" });
  const year = Number(request.query?.year);
  if (!Number.isInteger(year) || year < 2024 || year > 2100) return response.status(400).json({ error: "연도를 확인해주세요." });

  response.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
  if (year === 2026) return response.status(200).json({ year, holidays: OFFICIAL_2026, source: "official-2026" });

  const fixed = FIXED_HOLIDAYS.map(([monthDay, name]) => ({ date: `${year}-${monthDay}`, name }));
  try {
    const upstreamResponse = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/KR`, {
      headers: { Accept: "application/json" },
    });
    if (!upstreamResponse.ok) throw new Error(`Holiday API ${upstreamResponse.status}`);
    const upstream = await upstreamResponse.json();
    const holidays = mergeHolidays([
      ...fixed,
      ...(Array.isArray(upstream) ? upstream.map((item) => normalizeUpstreamHoliday(item, year)).filter(Boolean) : []),
    ]);
    return response.status(200).json({ year, holidays, source: "automatic" });
  } catch {
    return response.status(200).json({ year, holidays: fixed, source: "fixed-date-fallback" });
  }
}
