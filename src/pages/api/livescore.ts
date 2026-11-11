export const prerender = false;

import type { APIRoute } from 'astro';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

// Cache lsId per resultsUrl to avoid fetching LSResult.aspx on every poll
const lsIdCache = new Map<string, { id: string; ts: number }>();
const LS_ID_TTL = 3 * 60 * 1000; // 3 minutes

function strip(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&frac12;/g, '½').replace(/&#189;/g, '½').replace(/\s+/g, ' ').trim();
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseLivescorePage(html: string) {
  const compName = strip(html.match(/<span[^>]*id="Label_Event"[^>]*>(.*?)<\/span>/is)?.[1] ?? '');
  const section  = strip(html.match(/<span[^>]*id="Label_Comment"[^>]*>(.*?)<\/span>/is)?.[1] ?? '');

  const judges = [...html.matchAll(/<td[^>]*class="judges"[^>]*>(.*?)<\/td>/gis)]
    .map(m => strip(m[1])).filter(Boolean);

  const seenPages = new Set<string>();
  const tabs: { name: string; page: number; path: string }[] = [];
  for (const [, path, pageNum, name] of [...html.matchAll(
    /href=["'](\/Livescore\/Livescore\/Livescore(\d+)\.html\?id=[^"']+)["'][^>]*>\s*([^<]+)\s*<\/a>/gi
  )]) {
    const pn = pageNum.trim();
    if (!seenPages.has(pn)) {
      seenPages.add(pn);
      tabs.push({ name: name.trim().replace(/\s+/g, ' '), page: parseInt(pn), path });
    }
  }

  // Parse column headers from bgcbLACK rows
  function parseHeaderRow(rowHtml: string): string[] {
    return [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(([, inner]) => {
      // empty cell with no meaningful text = nationality column
      if (/<img[^>]+>/i.test(inner)) return '';
      return strip(inner);
    });
  }

  const headerRows = [...html.matchAll(/<tr[^>]*class="bgcbLACK"[^>]*>([\s\S]*?)<\/tr>/gi)];
  const standingsCols: string[] = headerRows[0] ? parseHeaderRow(headerRows[0][1]) : [];
  const drawlistCols: string[]  = headerRows[1] ? parseHeaderRow(headerRows[1][1]) : [];

  // Parse data rows as plain string arrays
  const standings: string[][] = [];
  const standingsQualified: boolean[] = []; // true = bgcr row (qualifies for finals)
  const drawlist:  string[][] = [];
  let lastResultBackNum = '';

  // Also match _tr1 drag-separator rows (no class on <tr>, identified by id suffix _tr1)
  const ROW_RE = /<tr([^>]*(?:class="(?:bgc[rw]\d*|bgsc\d*|mark)"|id="RP_Draw_[^"]*_tr1")[^>]*)>([\s\S]*?)<\/tr>/gi;

  for (const [, trAttrs, rowHtml] of [...html.matchAll(ROW_RE)]) {
    const isDraw   = /id="RP_Draw_/i.test(trAttrs);
    const isMark   = /class="mark"/i.test(trAttrs);
    const isDragRow  = /_tr1"/i.test(trAttrs);   // arena-drag separator row (_tr1)
    const isScratch  = /class="bgsc\d*/i.test(trAttrs); // scratched entry (_tr2)

    // Arena-drag separator: no data cells, push sentinel immediately
    if (isDragRow && isDraw) {
      drawlist.push(['__DRAG__']);
      continue;
    }

    // Finalist detection: first <td> has class "dsR19_Finalist" on showmanager
    const firstTdClass = rowHtml.match(/<td[^>]*class="([^"]*)"[^>]*>/i)?.[1] ?? '';
    const isQualified = firstTdClass.includes('Finalist');

    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(([, inner]) => {
      const nat = inner.match(/<img[^>]+alt="([A-Z]{2,3})"[^>]*>/i)?.[1];
      if (nat) return nat;
      return strip(inner);
    });

    if (cells.length < 3) continue;
    const placeVal = cells[0] ?? '';
    if (!/\d/.test(placeVal) && placeVal.length > 5) continue;

    if (isDraw) {
      drawlist.push(isScratch ? ['__SC__', ...cells] : cells);
    } else {
      standings.push(cells);
      standingsQualified.push(isQualified);
      if (isMark) lastResultBackNum = cells[2] ?? ''; // back# at index 2
    }
  }

  // Count of finalist rows — last index where dsR19_Finalist was found
  const qualifiedCount = standingsQualified.lastIndexOf(true) + 1;

  return { compName, section, judges, tabs, standingsCols, drawlistCols, standings, qualifiedCount, drawlist, lastResultBackNum };
}

export const GET: APIRoute = async ({ url }) => {
  const resultsUrl = url.searchParams.get('resultsUrl');
  const page = url.searchParams.get('page') ?? '100';

  if (!resultsUrl) {
    return new Response(JSON.stringify({ error: 'Missing resultsUrl' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    let lsId: string;
    const cached = lsIdCache.get(resultsUrl);
    if (cached && Date.now() - cached.ts < LS_ID_TTL) {
      lsId = cached.id;
    } else {
      const lsResultHtml = await fetchHtml(resultsUrl);
      const iframeSrc = lsResultHtml.match(
        /<iframe[^>]*src=["'](\/Livescore\/Livescore\/Livescore\d+\.html\?id=[^"']+)["']/i
      );
      if (!iframeSrc) return new Response(JSON.stringify({ error: 'Could not find livescore iframe' }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      });
      const id = iframeSrc[1].match(/\?id=(\d+)/)?.[1];
      if (!id) throw new Error('No id in iframe src');
      lsId = id;
      lsIdCache.set(resultsUrl, { id: lsId, ts: Date.now() });
    }

    const livescoreUrl = `https://www.showmanager.info/Livescore/Livescore/Livescore${page}.html?id=${lsId}`;
    const data = parseLivescorePage(await fetchHtml(livescoreUrl));

    return new Response(
      JSON.stringify({ ...data, fetchedAt: new Date().toISOString(), livescoreUrl }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to fetch', detail: String(e) }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    });
  }
};
