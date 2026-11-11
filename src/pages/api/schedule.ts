export const prerender = false;

import type { APIRoute } from 'astro';

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').trim();
}

export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get('id');
  if (!id || !/^\d+$/.test(id)) {
    return new Response(JSON.stringify({ error: 'Missing or invalid id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const smUrl = `https://www.showmanager.info/Eventliste.aspx?turnierID=${id}`;
  let html: string;
  try {
    const res = await fetch(smUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ReiningFactory/1.0)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to fetch source' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // --- Parse top scores ---
  // Top scores use class="zeitplanbs" or similar in a dedicated section
  const topScores: { horse: string; rider: string; score: string; competition: string }[] = [];
  const tsSection = html.match(/Top\s*Score[^]*?(?=<div class="col-|<h[23]|zeitplandatum|$)/i)?.[0] ?? '';
  if (tsSection) {
    const tsRows = tsSection.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    for (const [, cells] of tsRows) {
      const tds = [...cells.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(([, c]) => stripTags(c));
      if (tds.length >= 4 && tds[2] && !isNaN(Number(tds[2]))) {
        topScores.push({ horse: tds[0], rider: tds[1], score: tds[2], competition: tds[3] });
      }
    }
  }

  // --- Parse daily schedule using zeitplandatum class ---
  const schedule: { day: string; entries: { time: string; competition: string; pattern: string; notes: string }[] }[] = [];

  // Split the HTML at each day boundary using zeitplandatum spans
  const dayMatches = [...html.matchAll(/class="zeitplandatum"[^>]*>[\s\S]*?<span[^>]*>\s*([^<]+)\s*<\/span>/gi)];

  for (let i = 0; i < dayMatches.length; i++) {
    const dayName = dayMatches[i][1].trim();
    const dayStart = dayMatches[i].index! + dayMatches[i][0].length;
    const dayEnd = i + 1 < dayMatches.length ? dayMatches[i + 1].index! : html.length;
    const dayBlock = html.slice(dayStart, dayEnd);

    const entries: { time: string; competition: string; pattern: string; notes: string }[] = [];

    // Each schedule row: has a cell with class containing zeitplanbd for time
    // Row pattern: <tr ...> <td ...zeitplanbd...> TIME </td> <td ...> COMPETITION (nested table with notes) </td> <td ...zeitplanbd...> PATTERN </td> ...
    const rowMatches = [...dayBlock.matchAll(/<tr[^>]*class="bgc[^"]*"[^>]*>([\s\S]*?)<\/tr>\s*(?=<tr|$)/gi)];

    for (const [, rowHtml] of rowMatches) {
      // Extract all top-level td cells (not nested)
      const tdMatches = [...rowHtml.matchAll(/<td(?:\s[^>]*)?>(?![\s\S]*<table)([\s\S]*?)<\/td>/gi)];

      // Find time: look for zeitplanbd span
      const timeMatch = rowHtml.match(/class="zeitplanbd"[^>]*>[\s\S]*?<span[^>]*>\s*(\d{2}:\d{2})\s*<\/span>/i);
      if (!timeMatch) continue;
      const time = timeMatch[1];

      // Competition: first zeitplanbd span that is NOT a time
      const compSpans = [...rowHtml.matchAll(/class="zeitplanbd"[^>]*>[\s\S]*?<span[^>]*>\s*([^<]+)\s*<\/span>/gi)];
      const competition = compSpans.find(m => !/^\d{2}:\d{2}$/.test(m[1].trim()) && !/^\d{1,3}$/.test(m[1].trim()))?.[1]?.trim() ?? '';

      // Notes: zeitplannk class
      const notesMatch = rowHtml.match(/class="zeitplannk"[^>]*>[\s\S]*?<span[^>]*>\s*([^<]+)\s*<\/span>/i);
      const notes = notesMatch?.[1]?.trim() ?? '';

      // Pattern: single number span (not time)
      const patternMatch = compSpans.find(m => /^\d{1,3}$/.test(m[1].trim()));
      const pattern = patternMatch?.[1]?.trim() ?? '';

      if (competition) {
        entries.push({ time, competition, pattern, notes });
      }
    }

    if (entries.length) schedule.push({ day: dayName, entries });
  }

  return new Response(
    JSON.stringify({ topScores, schedule, source: smUrl, fetchedAt: new Date().toISOString() }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=60',
      },
    }
  );
};
