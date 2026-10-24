const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const FEED_REVISION = 3;
const REFRESH_MS = 24 * 60 * 60 * 1000;
const HISTORY_MS = 14 * 24 * 60 * 60 * 1000;
const DATA_DIR = path.join(__dirname, 'data');
const GLOBAL_CACHE = path.join(DATA_DIR, 'edition.json');
const SHARE_DIR = path.join(DATA_DIR, 'shared-editions');
const GLOBAL_FEEDS = [
  { name: 'BBC News', section: 'World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'BBC News', section: 'Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { name: 'BBC News', section: 'Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml' },
  { name: 'BBC News', section: 'Science', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml' },
  { name: 'NASA', section: 'Science', url: 'https://www.nasa.gov/feed/' },
  { name: 'The Guardian', section: 'World', url: 'https://www.theguardian.com/world/rss' },
  { name: 'The Guardian', section: 'Culture', url: 'https://www.theguardian.com/culture/rss' },
  { name: 'NPR', section: 'World', url: 'https://feeds.npr.org/1001/rss.xml' },
  { name: 'Al Jazeera', section: 'World', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'DW News', section: 'World', url: 'https://rss.dw.com/rdf/rss-en-all' },
  { name: 'France 24', section: 'World', url: 'https://www.france24.com/en/rss' },
  { name: 'PBS NewsHour', section: 'World', url: 'https://www.pbs.org/newshour/feeds/rss/headlines' },
  { name: 'The Conversation', section: 'World', url: 'https://theconversation.com/global/articles.atom' }
];

let edition = { updatedAt: null, articles: [], status: 'Starting first edition' };
const countryEditions = new Map();
const countryRefreshes = new Map();
const COUNTRIES = {
  US: { name: 'United States', locale: 'en-US', topics: { World: 'WORLD', Business: 'BUSINESS', Technology: 'TECHNOLOGY', Science: 'SCIENCE', Culture: 'ENTERTAINMENT' } },
  GB: { name: 'United Kingdom', locale: 'en-GB', topics: { World: 'WORLD', Business: 'BUSINESS', Technology: 'TECHNOLOGY', Science: 'SCIENCE', Culture: 'ENTERTAINMENT' } },
  IN: { name: 'India', locale: 'en-IN', topics: { World: 'WORLD', Business: 'BUSINESS', Technology: 'TECHNOLOGY', Science: 'SCIENCE', Culture: 'ENTERTAINMENT' } },
  CA: { name: 'Canada', locale: 'en-CA', topics: { World: 'WORLD', Business: 'BUSINESS', Technology: 'TECHNOLOGY', Science: 'SCIENCE', Culture: 'ENTERTAINMENT' } },
  AU: { name: 'Australia', locale: 'en-AU', topics: { World: 'WORLD', Business: 'BUSINESS', Technology: 'TECHNOLOGY', Science: 'SCIENCE', Culture: 'ENTERTAINMENT' } },
  NZ: { name: 'New Zealand', locale: 'en-NZ', topics: { World: 'WORLD', Business: 'BUSINESS', Technology: 'TECHNOLOGY', Science: 'SCIENCE', Culture: 'ENTERTAINMENT' } },
  IE: { name: 'Ireland', locale: 'en-IE', topics: { World: 'WORLD', Business: 'BUSINESS', Technology: 'TECHNOLOGY', Science: 'SCIENCE', Culture: 'ENTERTAINMENT' } },
  SG: { name: 'Singapore', locale: 'en-SG', topics: { World: 'WORLD', Business: 'BUSINESS', Technology: 'TECHNOLOGY', Science: 'SCIENCE', Culture: 'ENTERTAINMENT' } },
  ZA: { name: 'South Africa', locale: 'en-ZA', topics: { World: 'WORLD', Business: 'BUSINESS', Technology: 'TECHNOLOGY', Science: 'SCIENCE', Culture: 'ENTERTAINMENT' } },
  NG: { name: 'Nigeria', locale: 'en-NG', topics: { World: 'WORLD', Business: 'BUSINESS', Technology: 'TECHNOLOGY', Science: 'SCIENCE', Culture: 'ENTERTAINMENT' } },
  DE: { name: 'Germany', locale: 'de-DE', topics: { World: 'WORLD', Business: 'BUSINESS', Technology: 'TECHNOLOGY', Science: 'SCIENCE', Culture: 'ENTERTAINMENT' } },
  FR: { name: 'France', locale: 'fr-FR', topics: { World: 'WORLD', Business: 'BUSINESS', Technology: 'TECHNOLOGY', Science: 'SCIENCE', Culture: 'ENTERTAINMENT' } },
  ES: { name: 'Spain', locale: 'es-ES', topics: { World: 'WORLD', Business: 'BUSINESS', Technology: 'TECHNOLOGY', Science: 'SCIENCE', Culture: 'ENTERTAINMENT' } },
  IT: { name: 'Italy', locale: 'it-IT', topics: { World: 'WORLD', Business: 'BUSINESS', Technology: 'TECHNOLOGY', Science: 'SCIENCE', Culture: 'ENTERTAINMENT' } },
  JP: { name: 'Japan', locale: 'ja-JP', topics: { World: 'WORLD', Business: 'BUSINESS', Technology: 'TECHNOLOGY', Science: 'SCIENCE', Culture: 'ENTERTAINMENT' } },
  KR: { name: 'South Korea', locale: 'ko-KR', topics: { World: 'WORLD', Business: 'BUSINESS', Technology: 'TECHNOLOGY', Science: 'SCIENCE', Culture: 'ENTERTAINMENT' } },
  BR: { name: 'Brazil', locale: 'pt-BR', topics: { World: 'WORLD', Business: 'BUSINESS', Technology: 'TECHNOLOGY', Science: 'SCIENCE', Culture: 'ENTERTAINMENT' } },
  MX: { name: 'Mexico', locale: 'es-419', topics: { World: 'WORLD', Business: 'BUSINESS', Technology: 'TECHNOLOGY', Science: 'SCIENCE', Culture: 'ENTERTAINMENT' } }
};
const READER_LANGUAGES = { English: 'en', Hindi: 'hi', Spanish: 'es', French: 'fr', Portuguese: 'pt', German: 'de', Japanese: 'ja', Arabic: 'ar', Bengali: 'bn', Chinese: 'zh' };
const GOOGLE_LANGUAGES = { ...READER_LANGUAGES, Chinese: 'zh-CN' };
const TRANSLATORS = [process.env.LIBRETRANSLATE_URL || 'https://translate.argosopentech.com', 'https://libretranslate.de'];
const translationCache = new Map();

function countryFeeds(code) {
  const country = COUNTRIES[code];
  return Object.entries(country.topics).map(([section, topic]) => ({
    name: `Google News · ${country.name}`,
    section,
    url: `https://news.google.com/rss/headlines/section/topic/${topic}?hl=${country.locale}&gl=${code}&ceid=${code}:${country.locale.split('-')[0]}`
  }));
}

function decode(s = '') {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/<\/(p|div|li|h[1-6]|br)\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decode(match[1]) : '';
}

function parseFeed(xml, feed) {
  const entries = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) || [];
  return entries.map(entry => {
    const linkTag = entry.match(/<link\b([^>]*)\/?\s*>/i);
    const href = linkTag?.[1]?.match(/href=["']([^"']+)/i)?.[1];
    const link = href || tag(entry, 'link') || tag(entry, 'guid');
    const description = tag(entry, 'description') || tag(entry, 'summary') || tag(entry, 'content');
    const image = entry.match(/<(?:media:thumbnail|media:content|enclosure)\b[^>]*\burl=["']([^"']+)["'][^>]*>/i)?.[1]
      || entry.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1]
      || entry.match(/<img\b[^>]*\bsrcset=["']([^"']+)["']/i)?.[1]?.split(/[ ,]/)[0]
      || '';
    const date = tag(entry, 'pubDate') || tag(entry, 'published') || tag(entry, 'updated');
    let imageUrl = '';
    try { const parsed = new URL(image); if (parsed.protocol === 'https:') imageUrl = parsed.href; } catch { /* Ignore invalid or unsafe image URLs. */ }
    return { title: tag(entry, 'title'), description, image: imageUrl, link, date, source: feed.name, section: feed.section };
  }).filter(item => item.title && /^https?:\/\//i.test(item.link));
}

const STOP_WORDS = new Set('about after again against all also and are because been before between both but can could did does each from have here how into its just more most new not now off once only other our out over said same she some such than that the their them then there these they this those through under very was were what when where which while who will with would you your'.split(' '));

function titleTerms(title) {
  return new Set((title.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(word => !STOP_WORDS.has(word)));
}

function clusterArticles(articles) {
  const clusters = [];
  for (const article of articles) {
    const terms = titleTerms(article.title);
    let best = null;
    let bestScore = 0;
    for (const cluster of clusters) {
      const lead = cluster[0];
      if (cluster.some(item => item.source === article.source)) continue;
      const hoursApart = Math.abs(new Date(lead.date).getTime() - new Date(article.date).getTime()) / 3600000;
      if (Number.isFinite(hoursApart) && hoursApart > 48) continue;
      const leadTerms = titleTerms(lead.title);
      const shared = [...terms].filter(word => leadTerms.has(word)).length;
      const score = shared / Math.max(terms.size, leadTerms.size, 1);
      if (shared >= 2 && score >= 0.34 && score > bestScore) { best = cluster; bestScore = score; }
    }
    if (best) best.push(article);
    else clusters.push([article]);
  }
  return clusters.map(cluster => ({ ...cluster[0], coverage: cluster }));
}

async function refresh(countryCode = null) {
  const target = countryCode ? (countryEditions.get(countryCode) || { updatedAt: null, articles: [] }) : edition;
  target.status = 'Updating sources';
  if (countryCode) countryEditions.set(countryCode, target);
  const feeds = countryCode ? countryFeeds(countryCode) : GLOBAL_FEEDS;
  const results = await Promise.allSettled(feeds.map(async feed => {
    const response = await fetch(feed.url, { headers: { 'User-Agent': 'DailyEdition/1.0 (RSS reader)' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${feed.name} ${feed.section}: HTTP ${response.status}`);
    return parseFeed(await response.text(), feed);
  }));
  let articles = results.flatMap(result => result.status === 'fulfilled' ? result.value : (console.error(result.reason.message), []));
  const seen = new Set();
  articles = articles.filter(item => { const key = item.link.split('?')[0]; if (seen.has(key)) return false; seen.add(key); return true; });
  articles.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  articles = articles.slice(0, 60);
  const publisherCoverage = articles.map(article => ({ ...article, summary: article.description }));
  const collectedAt = new Date().toISOString();
  const historyFile = path.join(DATA_DIR, `timeline-${countryCode || 'global'}.json`);
  let history = [];
  try { history = JSON.parse(await fs.readFile(historyFile, 'utf8')); } catch { /* History begins with this edition. */ }
  const sameDailyEdition = history[0] && Date.now() - new Date(history[0].collectedAt).getTime() < 20 * 60 * 60 * 1000;
  history = (sameDailyEdition ? [{ collectedAt, articles: publisherCoverage }, ...history.slice(1)] : [{ collectedAt, articles: publisherCoverage }, ...history])
    .filter(snapshot => Date.now() - new Date(snapshot.collectedAt).getTime() <= HISTORY_MS)
    .slice(0, 14);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(historyFile, JSON.stringify(history, null, 2));
  const historicalReports = history.flatMap(snapshot => snapshot.articles.map(item => ({ ...item, collectedAt: snapshot.collectedAt })));
  const groupedStories = clusterArticles(publisherCoverage).map(story => {
    const terms = titleTerms(story.title);
    const timeline = new Map();
    for (const report of historicalReports) {
      const reportTerms = titleTerms(report.title);
      const shared = [...terms].filter(word => reportTerms.has(word)).length;
      const similarity = shared / Math.max(terms.size, reportTerms.size, 1);
      const daysApart = Math.abs(new Date(report.date || report.collectedAt).getTime() - new Date(story.date || collectedAt).getTime()) / 86400000;
      if ((report.link === story.link || (shared >= 2 && similarity >= 0.34)) && (!Number.isFinite(daysApart) || daysApart <= 14)) {
        const key = `${report.link}|${report.title.toLocaleLowerCase()}`;
        if (!timeline.has(key)) timeline.set(key, { title: report.title, source: report.source, section: report.section, link: report.link, date: report.date || report.collectedAt, observedAt: report.collectedAt });
      }
    }
    return { ...story, timeline: [...timeline.values()].sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt)).slice(-20) };
  });
  if (groupedStories.length) {
    const updatedEdition = { updatedAt: new Date().toISOString(), feedRevision: FEED_REVISION, articles: groupedStories, status: 'Edition ready', country: countryCode || null };
    if (countryCode) countryEditions.set(countryCode, updatedEdition);
    else edition = updatedEdition;
    const cacheFile = countryCode ? path.join(DATA_DIR, `edition-${countryCode}.json`) : GLOBAL_CACHE;
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify(updatedEdition, null, 2));
  } else {
    target.status = 'Could not reach sources. Showing the last saved edition if available.';
  }
  console.log(`${countryCode || 'Global'} edition — ${target.status}: ${target.articles.length} stories`);
}

function startCountryRefresh(code) {
  if (countryRefreshes.has(code)) return;
  const task = refresh(code).finally(() => countryRefreshes.delete(code));
  countryRefreshes.set(code, task);
}

async function translateText(text, target) {
  const cacheKey = `${target}:${text}`;
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);
  let lastError;
  try {
    const googleTarget = Object.entries(READER_LANGUAGES).find(([, code]) => code === target)?.[0] || target;
    const targetCode = GOOGLE_LANGUAGES[googleTarget] || target;
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetCode)}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Google Translate returned ${response.status}`);
    const result = await response.json();
    const translated = result[0]?.map(part => part[0] || '').join('').trim();
    if (!translated) throw new Error('Google Translate returned no text');
    if (translationCache.size > 2000) translationCache.delete(translationCache.keys().next().value);
    translationCache.set(cacheKey, translated);
    return translated;
  } catch (error) { lastError = error; }
  for (const baseUrl of TRANSLATORS) {
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/translate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, source: 'auto', target, format: 'text' }),
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error(`Translator returned ${response.status}`);
      const result = await response.json();
      if (!result.translatedText) throw new Error('Translator returned no text');
      if (translationCache.size > 2000) translationCache.delete(translationCache.keys().next().value);
      translationCache.set(cacheKey, result.translatedText);
      return result.translatedText;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('No translation server responded.');
}

async function loadCache() {
  try { edition = JSON.parse(await fs.readFile(GLOBAL_CACHE, 'utf8')); }
  catch { /* First run has no saved edition yet. */ }
}

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/share' && req.method === 'POST') {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1_000_000) { res.writeHead(413); return res.end('Edition snapshot is too large.'); }
      chunks.push(chunk);
    }
    try {
      const payload = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const input = payload.edition;
      if (!input || !Array.isArray(input.articles) || input.articles.length > 60) throw new Error('Choose a loaded edition of 60 stories or fewer.');
      const articles = input.articles.map(article => {
        const cleanLink = value => { try { const parsed = new URL(value); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : ''; } catch { return ''; } };
        const cleanItem = item => ({
          title: String(item.title || '').slice(0, 500), summary: String(item.summary || '').slice(0, 2200),
          description: String(item.description || '').slice(0, 2200), source: String(item.source || '').slice(0, 100),
          section: String(item.section || 'World').slice(0, 80), date: String(item.date || '').slice(0, 80),
          link: cleanLink(item.link), image: cleanLink(item.image)
        });
        const cleaned = cleanItem(article);
        cleaned.coverage = Array.isArray(article.coverage) ? article.coverage.slice(0, 10).map(cleanItem) : [cleanItem(article)];
        cleaned.timeline = Array.isArray(article.timeline) ? article.timeline.slice(0, 20).map(item => ({
          source: String(item.source || '').slice(0, 100), title: String(item.title || '').slice(0, 500),
          date: String(item.date || '').slice(0, 80), observedAt: String(item.observedAt || '').slice(0, 80), link: cleanLink(item.link)
        })) : [];
        return cleaned;
      }).filter(article => article.title && article.link);
      if (!articles.length) throw new Error('This edition has no shareable stories yet.');
      const id = crypto.randomUUID();
      const sharedEdition = { id, updatedAt: String(input.updatedAt || new Date().toISOString()), createdAt: new Date().toISOString(), country: input.country || null, articles };
      await fs.mkdir(SHARE_DIR, { recursive: true });
      await fs.writeFile(path.join(SHARE_DIR, `${id}.json`), JSON.stringify(sharedEdition), { flag: 'wx' });
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ id, createdAt: sharedEdition.createdAt }));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: error.message }));
    }
  }
  const shareMatch = url.pathname.match(/^\/api\/share\/([a-f\d-]{36})$/i);
  if (shareMatch && req.method === 'GET') {
    try {
      const sharedEdition = await fs.readFile(path.join(SHARE_DIR, `${shareMatch[1]}.json`), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' });
      return res.end(sharedEdition);
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'This shared edition could not be found.' }));
    }
  }
  if (url.pathname === '/api/countries') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(Object.entries(COUNTRIES).map(([code, value]) => ({ code, name: value.name }))));
  }
  if (url.pathname === '/api/translate' && req.method === 'POST') {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 400_000) { res.writeHead(413); return res.end('Edition is too large to transform.'); }
      chunks.push(chunk);
    }
    try {
      const payload = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const target = READER_LANGUAGES[payload.language];
      if (!target) throw new Error('Choose a supported language.');
      if (!Array.isArray(payload.articles) || payload.articles.length > 60) throw new Error('Please translate an edition of 60 stories or fewer.');
      const translated = new Array(payload.articles.length);
      const providerIssues = new Set();
      let next = 0;
      async function worker() {
        while (next < payload.articles.length) {
          const id = next++;
          const article = payload.articles[id];
          const title = String(article.title || '').slice(0, 500);
          const summary = String(article.summary || article.description || '').slice(0, 1800);
          if (payload.language === 'English' && /^[\x00-\x7F]*$/.test(`${title} ${summary}`)) {
            translated[id] = { id, title, summary, translated: false };
            continue;
          }
          try {
            const [translatedTitle, translatedSummary] = await Promise.all([translateText(title, target), translateText(summary, target)]);
            translated[id] = { id, title: translatedTitle, summary: translatedSummary, translated: true };
          } catch (error) {
            console.error(`Translation unavailable for story ${id}:`, error.message);
            providerIssues.add(error.message);
            translated[id] = { id, title, summary, translated: false };
          }
        }
      }
      await Promise.all([worker(), worker(), worker()]);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      const failed = translated.filter(item => !item.translated).length;
      return res.end(JSON.stringify({ stories: translated, failed, translated: translated.length - failed, providerIssue: [...providerIssues][0] || null }));
    } catch (error) {
      res.writeHead(error.message.startsWith('Choose') || error.message.startsWith('Please') ? 400 : 500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: error.message }));
    }
  }
  if (url.pathname === '/api/refresh' && req.method === 'POST') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let requestedCountry = null;
    try { requestedCountry = JSON.parse(Buffer.concat(chunks).toString() || '{}').country || null; } catch { /* Default to the global edition. */ }
    if (requestedCountry && COUNTRIES[requestedCountry]) startCountryRefresh(requestedCountry);
    else if (edition.status !== 'Updating sources') refresh();
    res.writeHead(202, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ status: 'Updating sources' }));
  }
  if (url.pathname === '/api/edition') {
    const countryCode = url.searchParams.get('country');
    if (countryCode && COUNTRIES[countryCode]) {
      let selected = countryEditions.get(countryCode);
      if (!selected) {
        try {
          selected = JSON.parse(await fs.readFile(path.join(DATA_DIR, `edition-${countryCode}.json`), 'utf8'));
          countryEditions.set(countryCode, selected);
        } catch { selected = { updatedAt: null, articles: [], status: `Preparing ${COUNTRIES[countryCode].name} headlines…`, country: countryCode }; countryEditions.set(countryCode, selected); }
      }
      const historyExists = await fs.access(path.join(DATA_DIR, `timeline-${countryCode}.json`)).then(() => true, () => false);
      if ((!selected.updatedAt || Date.now() - new Date(selected.updatedAt).getTime() >= REFRESH_MS || !historyExists) && !countryRefreshes.has(countryCode)) startCountryRefresh(countryCode);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(selected));
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(edition));
  }
  const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.resolve(__dirname, relative);
  if (!file.startsWith(__dirname + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});

loadCache().then(() => {
  server.listen(PORT, () => console.log(`Daily Edition is running at http://localhost:${PORT}`));
  const fresh = !edition.updatedAt || Date.now() - new Date(edition.updatedAt).getTime() >= REFRESH_MS || edition.feedRevision !== FEED_REVISION;
  const historyExists = fs.access(path.join(DATA_DIR, 'timeline-global.json')).then(() => true, () => false);
  historyExists.then(exists => { if (fresh || !exists) refresh(); });
  setInterval(refresh, REFRESH_MS);
});
