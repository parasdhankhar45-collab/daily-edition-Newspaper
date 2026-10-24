const stories = document.querySelector('#stories');
const updated = document.querySelector('#updated');
const notice = document.querySelector('#notice');
const savedPageView = (() => { try { return JSON.parse(sessionStorage.getItem('daily-edition-view') || '{}'); } catch { return {}; } })();
sessionStorage.removeItem('daily-edition-view');
let currentFilter = savedPageView.currentFilter || 'All';
let selectedContinent = savedPageView.selectedContinent || null;
let initialScrollY = Math.max(0, Number(savedPageView.scrollY) || 0);
let restoredInitialView = false;
let saveViewTimer;
function savePageView() {
  sessionStorage.setItem('daily-edition-view', JSON.stringify({
    scrollY: window.scrollY,
    currentFilter,
    selectedContinent,
    worldMode: !document.querySelector('#world-desk').hidden
  }));
}
window.addEventListener('scroll', () => {
  clearTimeout(saveViewTimer);
  saveViewTimer = setTimeout(savePageView, 120);
}, { passive: true });
let edition = { articles: [] };
let displayArticles = null;
const countryPicker = document.querySelector('#country-picker');
let currentCountry = localStorage.getItem('daily-edition-country') || '';
let savedArticles = new Map(JSON.parse(localStorage.getItem('daily-edition-saved') || '[]').map(article => [article.link, article]));
let savedStories = new Set(savedArticles.keys());
let savedFolders = new Map(Object.entries(JSON.parse(localStorage.getItem('daily-edition-folders-by-story') || '{}')));
let activeSavedFolder = 'All';
const readerTextScale = Math.min(2, Math.max(0, Number(localStorage.getItem('daily-edition-text-scale')) || 0));
let textScale = readerTextScale;
let highContrast = localStorage.getItem('daily-edition-high-contrast') === 'true';
const sharedEditionId = new URLSearchParams(location.search).get('edition');
const sharedEditionSnapshot = new URLSearchParams(location.hash.slice(1)).get('edition-snapshot');
const COUNTRY_CONTEXT = {
  US: ['Washington, D.C.', 'America/New_York', 38.9072, -77.0369], GB: ['London', 'Europe/London', 51.5072, -.1276],
  IN: ['New Delhi', 'Asia/Kolkata', 28.6139, 77.209], CA: ['Ottawa', 'America/Toronto', 45.4215, -75.6972],
  AU: ['Canberra', 'Australia/Sydney', -35.2809, 149.13], NZ: ['Wellington', 'Pacific/Auckland', -41.2866, 174.7756],
  IE: ['Dublin', 'Europe/Dublin', 53.3498, -6.2603], SG: ['Singapore', 'Asia/Singapore', 1.3521, 103.8198],
  ZA: ['Pretoria', 'Africa/Johannesburg', -25.7479, 28.2293], NG: ['Abuja', 'Africa/Lagos', 9.0765, 7.3986],
  DE: ['Berlin', 'Europe/Berlin', 52.52, 13.405], FR: ['Paris', 'Europe/Paris', 48.8566, 2.3522],
  ES: ['Madrid', 'Europe/Madrid', 40.4168, -3.7038], IT: ['Rome', 'Europe/Rome', 41.9028, 12.4964],
  JP: ['Tokyo', 'Asia/Tokyo', 35.6762, 139.6503], KR: ['Seoul', 'Asia/Seoul', 37.5665, 126.978],
  BR: ['Brasília', 'America/Sao_Paulo', -15.7939, -47.8828], MX: ['Mexico City', 'America/Mexico_City', 19.4326, -99.1332]
};
const CONTINENT_COUNTRIES = {
  'North America': ['US', 'CA', 'MX'], 'South America': ['BR'], Europe: ['GB', 'IE', 'DE', 'FR', 'ES', 'IT'],
  Africa: ['ZA', 'NG'], Asia: ['IN', 'SG', 'JP', 'KR'], Oceania: ['AU', 'NZ']
};
const storedPreferences = JSON.parse(localStorage.getItem('daily-edition-preferences') || '{}');
let topicPreferences = Array.isArray(storedPreferences.topics) ? new Set(storedPreferences.topics) : null;
let sourcePreferences = Array.isArray(storedPreferences.sources) ? new Set(storedPreferences.sources) : null;
let followedTopics = new Set(JSON.parse(localStorage.getItem('daily-edition-followed-topics') || '[]'));
let savedFoldersList = [...new Set(JSON.parse(localStorage.getItem('daily-edition-folders') || '[]').filter(name => typeof name === 'string' && name.trim()))];

function escapeHTML(value = '') {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function relativeAge(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'date unavailable';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  if (Math.abs(seconds) < 60) return 'just now';
  const units = [[86400, 'day'], [3600, 'hour'], [60, 'minute']];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [size, unit] of units) if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  return formatter.format(seconds, 'second');
}

function whyItMatters(article) {
  const reportCount = (article.coverage || [article]).length;
  if (reportCount > 1) return `More than one publisher is following this story (${reportCount} reports), making it easier to compare what each source emphasizes.`;
  const topic = [...topicsForArticle(article)][0] || article.section;
  const context = {
    'Politics & Elections': 'Public decisions and political debates can shape policy and daily life.',
    'Economy & Markets': 'Economic changes can affect jobs, prices, savings, and household plans.',
    'Climate & Nature': 'Environmental events and policy can affect communities, ecosystems, and infrastructure.',
    'Health & Medicine': 'Health developments can change guidance, care, and the choices available to patients.',
    'AI & Technology': 'Technology decisions can affect privacy, work, communication, and access to information.',
    Education: 'Education policy and school changes can shape students’ opportunities and communities.',
    Sports: 'The result or decision affects teams, athletes, and the communities following them.',
    'Arts & Culture': 'Cultural stories show how people express ideas and preserve shared history.',
    'Space & Discovery': 'New research can expand what scientists know about Earth and the universe.',
    'Crime & Justice': 'Legal proceedings can affect people’s rights, safety, and public institutions.',
    'Travel & Food': 'Changes can affect travelers, local businesses, and everyday choices.'
  };
  return context[topic] || 'This report adds local detail to a wider story. Read the original source to see the full evidence and context.';
}

const WEATHER_LABELS = { 0: 'Clear sky', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Freezing fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Rain showers', 81: 'Showers', 82: 'Heavy showers', 95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with hail' };
let weatherForCountry = null;
function updateLocalClock() {
  const [city, timezone] = COUNTRY_CONTEXT[currentCountry] || [];
  const clock = document.querySelector('#local-clock');
  clock.textContent = city
    ? `${city} · ${new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date())}`
    : `Global edition · ${new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date())} UTC`;
}
async function updateLocalWeather(force = false) {
  const place = COUNTRY_CONTEXT[currentCountry];
  const weather = document.querySelector('#local-weather');
  if (!place) { weatherForCountry = null; weather.textContent = 'Choose a country edition for local conditions.'; return; }
  if (!force && weatherForCountry === currentCountry) return;
  const country = currentCountry;
  weatherForCountry = country;
  weather.textContent = `Checking ${place[0]}…`;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place[2]}&longitude=${place[3]}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Weather is unavailable');
    const result = await response.json();
    if (country !== currentCountry) return;
    const current = result.current;
    weather.textContent = `${place[0]} · ${Math.round(current.temperature_2m)}°C · ${WEATHER_LABELS[current.weather_code] || 'Current conditions'} · feels ${Math.round(current.apparent_temperature)}°C`;
  } catch { if (country === currentCountry) weather.textContent = `Weather for ${place[0]} is temporarily unavailable.`; }
}

const CONTINENTS = ['North America', 'South America', 'Europe', 'Africa', 'Asia', 'Oceania'];
const REGION_PATTERNS = {
  'North America': /\b(?:north america|united states|u\.s\.|usa|american|canada|canadian|mexico|mexican|alaska|california|new york|texas|florida|washington|los angeles|chicago|toronto|ottawa|montreal|white house|trump|biden|congress|senate|washington dc)\b/i,
  'South America': /\b(?:south america|latin america|brazil|brazilian|argentina|argentinian|chile|chilean|colombia|colombian|peru|peruvian|venezuela|venezuelan|bolivia|ecuador|uruguay|paraguay|guyana|suriname|lula|milei|bogota|sao paulo|buenos aires)\b/i,
  Europe: /\b(?:europe|european|united kingdom|britain|british|england|scotland|wales|ireland|irish|london|france|french|paris|germany|german|berlin|italy|italian|rome|spain|spanish|ukraine|ukrainian|russia|russian|poland|polish|brussels|netherlands|dutch|sweden|norway|finland|greece|portugal|austria|switzerland|serbia|balkans)\b/i,
  Africa: /\b(?:africa|african|kenya|kenyan|nigeria|nigerian|south africa|ghana|ethiopia|ethiopian|sudan|somalia|somali|democratic republic of congo|\bdrc\b|congo|tanzania|uganda|rwanda|senegal|egypt|egyptian|morocco|moroccan|algeria|tunisia|zimbabwe|mozambique|cameroon|mali|nairobi|lagos|johannesburg)\b/i,
  Asia: /\b(?:asia|asian|china|chinese|india|indian|japan|japanese|tokyo|south korea|north korea|pakistan|pakistani|bangladesh|sri lanka|taiwan|hong kong|israel|israeli|iran|iranian|iraq|saudi arabia|qatar|jordan|palestine|palestinian|gaza|lebanon|syria|yemen|afghanistan|nepal|myanmar|thailand|vietnam|indonesia|malaysia|philippines|singapore|beijing|delhi|seoul|islamabad|middle east)\b/i,
  Oceania: /\b(?:oceania|australia|australian|new zealand|zealand|pacific islands|fiji|papua new guinea|sydney|melbourne|canberra|brisbane|perth|auckland|wellington)\b/i
};
const SPACE_PATTERN = /\b(?:space|nasa|esa|astronaut|international space station|iss|rocket|rocket launch|space launch|launch vehicle|satellite|orbit|lunar|moon mission|artemis|mars rover|planetary|exoplanet|telescope|astronomy|cosmic|cosmos|spacex|starlink|starshield|blue origin|starship|meteor|asteroid|black hole|eclipse|spaceflight)\b/i;

function storyText(article) {
  return [article.title, article.summary, article.description, ...(article.coverage || []).flatMap(item => [item.title, item.summary, item.description])].filter(Boolean).join(' ');
}

function continentStories(continent) {
  const pattern = continent === 'Space' ? SPACE_PATTERN : REGION_PATTERNS[continent];
  if (!pattern) return [];
  return (edition.articles || []).filter(article => pattern.test(storyText(article)))
    .sort((a, b) => (b.coverage?.length || 1) - (a.coverage?.length || 1) || new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 10);
}

const SIMPLE_WORDS = [
  [/\bapproximately\b/gi, 'about'], [/\bassistance\b/gi, 'help'], [/\bcommence(?:d)?\b/gi, 'start'],
  [/\bdemonstrate(?:d|s)?\b/gi, 'show'], [/\bindividuals\b/gi, 'people'], [/\binvestigate(?:d|s)?\b/gi, 'look into'],
  [/\blocated\b/gi, 'found'], [/\bpurchase(?:d|s)?\b/gi, 'buy'], [/\brequire(?:d|s)?\b/gi, 'need'],
  [/\bsignificant\b/gi, 'important'], [/\bsubsequently\b/gi, 'later'], [/\butilize(?:d|s)?\b/gi, 'use'],
  [/\bprior to\b/gi, 'before'], [/\bin the event that\b/gi, 'if'], [/\ba large number of\b/gi, 'many']
];

const PERSONAL_TOPICS = [
  ['Politics & Elections', /\b(?:election|president|parliament|government|politic|minister|senate|congress|campaign|vote|voting|lawmakers|prime minister)\b/i],
  ['Economy & Markets', /\b(?:economy|economic|inflation|interest rate|jobs|employment|budget|tax|tariff|stock market|markets|trade deal|cost of living)\b/i],
  ['AI & Technology', /\b(?:artificial intelligence|ai|technology|tech company|software|cyber|algorithm|data privacy|robotics|smartphone|social media)\b/i],
  ['Climate & Nature', /\b(?:climate|environment|emissions|carbon|renewable|wildfire|flood|biodiversity|wildlife|pollution|conservation|drought|storm)\b/i],
  ['Health & Medicine', /\b(?:health|medical|hospital|disease|vaccine|cancer|mental health|doctor|patient|treatment|outbreak|ebola|covid)\b/i],
  ['Education', /\b(?:school|student|university|college|education|teacher|campus|exam|classroom|academic)\b/i],
  ['Sports', /\b(?:sport|football|cricket|soccer|tennis|olympic|formula one|match|league|athlete|tournament)\b/i],
  ['Arts & Culture', /\b(?:music|film|art|literature|book|theatre|entertainment|celebrity|cinema|culture|album|actor)\b/i],
  ['Space & Discovery', /\b(?:space|nasa|astronomy|planet|moon|mars|satellite|telescope|research|scientist|discovery|physics)\b/i],
  ['Crime & Justice', /\b(?:crime|court|police|murder|trial|judge|arrest|lawsuit|justice|sentencing|criminal|investigation)\b/i],
  ['Travel & Food', /\b(?:travel|tourism|airline|airport|holiday|restaurant|food|hotel|tourist|vacation|recipe|travelers)\b/i]
];

function topicsForArticle(article) {
  const text = `${article.title || ''} ${article.summary || ''} ${article.description || ''}`;
  return new Set([article.section, ...PERSONAL_TOPICS.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic)].filter(Boolean));
}

function simplifyForKids(value = '') {
  return SIMPLE_WORDS.reduce((text, [pattern, replacement]) => text.replace(pattern, match => /^[A-Z]/.test(match) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement), value)
    .replace(/\s*;\s*/g, '. ')
    .replace(/([.!?])\s+/g, '$1\n')
    .replace(/\n{2,}/g, '\n').trim();
}

function primaryTopicForArticle(article) {
  const text = `${article.title || ''} ${article.summary || ''} ${article.description || ''}`;
  return PERSONAL_TOPICS.find(([, pattern]) => pattern.test(text))?.[0] || article.section || 'World';
}

function renderSavedTools() {
  const tools = document.querySelector('#saved-tools');
  tools.hidden = currentFilter !== 'Saved';
  if (tools.hidden) return;
  const filter = document.querySelector('#saved-folder-filter');
  filter.innerHTML = `<option value="All">All saved stories</option><option value="Unfiled">Unfiled</option>${savedFoldersList.map(folder => `<option value="${escapeHTML(folder)}">${escapeHTML(folder)}</option>`).join('')}`;
  filter.value = [...filter.options].some(option => option.value === activeSavedFolder) ? activeSavedFolder : 'All';
}

function render() {
  const currentArticles = displayArticles || edition.articles;
  const articleList = currentFilter === 'Saved' ? [...savedArticles.values()].filter(article => activeSavedFolder === 'All' || (savedFolders.get(article.link) || 'Unfiled') === activeSavedFolder) : currentArticles;
  renderSavedTools();
  const query = document.querySelector('#story-search').value.trim().toLocaleLowerCase();
  const availableSources = new Set((edition.articles || []).flatMap(article => (article.coverage || [article]).map(item => item.source)));
  const activeSourcePreferences = sourcePreferences && [...sourcePreferences].some(source => availableSources.has(source)) ? sourcePreferences : null;
  const fitsPreferences = article => (!topicPreferences || [...topicsForArticle(article)].some(topic => topicPreferences.has(topic)))
    && (!followedTopics.size || [...topicsForArticle(article)].some(topic => followedTopics.has(topic)))
    && (!activeSourcePreferences || (article.coverage || [article]).some(item => activeSourcePreferences.has(item.source)));
  const lead = currentArticles.find(article => article.image && fitsPreferences(article)) || currentArticles.find(fitsPreferences);
  const showLead = currentFilter === 'All' && !query && Boolean(lead);
  const leadSection = document.querySelector('#lead-story');
  leadSection.hidden = !showLead;
  if (showLead) {
    const briefing = currentArticles.filter(article => article.link !== lead.link).slice(0, 3);
    const topicCounts = currentArticles.reduce((counts, article) => { for (const topic of topicsForArticle(article)) counts[topic] = (counts[topic] || 0) + 1; return counts; }, {});
    const trending = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    leadSection.innerHTML = `<div class="lead-copy"><span class="lead-kicker">${escapeHTML(lead.section || 'Top story')} <i></i> TODAY'S LEAD</span><h2>${escapeHTML(lead.title)}</h2><p>${escapeHTML(lead.summary || lead.description || 'Open the original report for the full story.')}</p><div class="lead-meta"><span>${escapeHTML((lead.coverage || [lead]).map(item => item.source).join(' · '))}</span><span>·</span><span>${escapeHTML(formatDate(lead.date))}</span></div><a class="lead-link" href="${escapeHTML(lead.link)}" target="_blank" rel="noopener noreferrer">Read the full story <span>↗</span></a></div>${lead.image ? `<a class="lead-image" href="${escapeHTML(lead.link)}" target="_blank" rel="noopener noreferrer" aria-label="Open: ${escapeHTML(lead.title)}"><img src="${escapeHTML(lead.image)}" alt="${escapeHTML(lead.title)}" referrerpolicy="no-referrer"><span class="lead-image-caption">${escapeHTML(lead.section || 'The Daily Edition')} <i>·</i> Read the original report</span></a>` : '<div class="lead-art" aria-hidden="true"><span>THE<br>WORLD<br>IN FOCUS</span></div>'}<aside class="lead-rail"><div class="briefing-block"><span class="rail-kicker">THE EDITION, AT A GLANCE</span><h3>In today’s briefing</h3><ol>${briefing.map((article, index) => `<li><span class="briefing-index">0${index + 1}</span><a href="${escapeHTML(article.link)}" target="_blank" rel="noopener noreferrer"><b>${escapeHTML(article.title)}</b><small>${escapeHTML((article.coverage || [article]).map(item => item.source).join(' · '))} <i>·</i> ${escapeHTML(formatDate(article.date))}</small></a></li>`).join('')}</ol></div><div class="trending-block"><div><span class="rail-kicker">FOLLOW THE THREADS</span><h3>Trending in this edition</h3></div><div class="trend-chips">${trending.map(([topic, count], index) => `<button type="button" data-trend="${escapeHTML(topic)}" class="trend-chip trend-${index % 3}"><span># ${escapeHTML(topic)}</span><small>${count}</small></button>`).join('')}</div><p>Tap a topic to explore its stories.</p></div></aside>`;
    const leadCopy = leadSection.querySelector('.lead-copy');
    const leadTopic = lead.section || 'World';
    leadCopy.querySelector('.lead-link').insertAdjacentHTML('beforebegin', `<aside class="why-matters"><b>WHY THIS MATTERS</b><p>${escapeHTML(whyItMatters(lead))}</p></aside><button type="button" class="follow-topic-button lead-follow" data-follow-topic="${escapeHTML(leadTopic)}" aria-pressed="${followedTopics.has(leadTopic)}">${followedTopics.has(leadTopic) ? `✓ Following ${escapeHTML(leadTopic)}` : `+ Follow ${escapeHTML(leadTopic)}`}</button>`);
    const leadImage = leadSection.querySelector('.lead-image img');
    if (leadImage) leadImage.addEventListener('error', () => { leadImage.closest('.lead-image')?.classList.add('no-image'); leadImage.remove(); }, { once: true });
  }
  const filtered = articleList.filter(article => !(showLead && article.link === lead.link) && (currentFilter === 'Saved' || (currentFilter === 'All' || article.section === currentFilter)
    && (!topicPreferences || [...topicsForArticle(article)].some(topic => topicPreferences.has(topic)))
    && (!followedTopics.size || [...topicsForArticle(article)].some(topic => followedTopics.has(topic)))
    && (!activeSourcePreferences || (article.coverage || [article]).some(item => activeSourcePreferences.has(item.source))))
    && (!query || [article.title, article.summary, article.description, article.source, article.section, ...topicsForArticle(article), ...(article.coverage || []).flatMap(item => [item.title, item.source])].some(value => value?.toLocaleLowerCase().includes(query))));
  document.querySelector('#story-heading-title').textContent = query ? 'Search results' : currentFilter === 'All' ? 'Today, in perspective' : currentFilter === 'Saved' ? 'Your reading list' : currentFilter;
  const personalized = Boolean(topicPreferences || activeSourcePreferences);
  document.querySelector('#visible-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'story' : 'stories'}${query ? ' found' : personalized || followedTopics.size ? ' · My edition' : ''}`;
  if (!filtered.length) {
    stories.innerHTML = `<div class="empty">${query ? `No stories match “${escapeHTML(query)}”. Try a different search.` : currentFilter === 'Saved' ? 'Your reading list is empty. Save a story with the ★ button and find it here.' : personalized ? 'No stories match these preferences. Open Personalize my edition to adjust your topics and sources.' : edition.articles.length ? 'No stories in this section today.' : 'The first edition is being prepared. Please check back shortly.'}</div>`;
    return;
  }
  stories.innerHTML = filtered.map((article, index) => `
    ${(() => {
      const coverage = article.coverage || [article];
      const publishers = [...new Set(coverage.map(item => item.source))];
      const primaryTopic = primaryTopicForArticle(article);
      const articleDate = new Date(article.date);
      const dateTime = Number.isNaN(articleDate.getTime()) ? '' : articleDate.toISOString();
      const currentFolder = savedFolders.get(article.link) || 'Unfiled';
      return `
    <article class="story ${index === 0 && currentFilter === 'All' ? 'featured' : ''} ${article.image ? 'has-image' : ''}">
      ${article.image ? `<a class="story-image" href="${escapeHTML(article.link)}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true"><img src="${escapeHTML(article.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.story-image').remove()"></a>` : ''}
      <div class="story-section">${escapeHTML(article.section)}</div>
      <button class="save-story ${savedStories.has(article.link) ? 'is-saved' : ''}" type="button" data-save="${escapeHTML(article.link)}" aria-label="${savedStories.has(article.link) ? 'Remove from' : 'Save to'} reading list" title="${savedStories.has(article.link) ? 'Remove saved story' : 'Save for later'}">${savedStories.has(article.link) ? '★' : '☆'}</button>
      <h2>${escapeHTML(article.title)}</h2>
      <p class="summary ${article.kidFriendly ? 'kid-summary' : ''}">${escapeHTML(article.summary || article.description || 'Open the original story for details.')}</p>
      <aside class="why-matters"><b>WHY IT MATTERS</b><p>${escapeHTML(whyItMatters(article))}</p></aside>
      <div class="story-meta"><span>${publishers.map(escapeHTML).join(' + ')}</span><span class="dot"></span><time class="freshness" ${dateTime ? `datetime="${dateTime}"` : ''} title="Published ${escapeHTML(formatDate(article.date))}">Published ${escapeHTML(relativeAge(article.date))}</time><span class="dot"></span><a class="source-link" href="${escapeHTML(article.link)}" target="_blank" rel="noopener noreferrer">Read source ↗</a></div>
      <div class="story-actions"><button type="button" data-follow-topic="${escapeHTML(primaryTopic)}" aria-pressed="${followedTopics.has(primaryTopic)}">${followedTopics.has(primaryTopic) ? '✓ Following' : `+ Follow ${escapeHTML(primaryTopic)}`}</button>${currentFilter === 'Saved' ? `<label>Folder <select data-story-folder="${escapeHTML(article.link)}"><option value="Unfiled" ${currentFolder === 'Unfiled' ? 'selected' : ''}>Unfiled</option>${savedFoldersList.map(folder => `<option value="${escapeHTML(folder)}" ${currentFolder === folder ? 'selected' : ''}>${escapeHTML(folder)}</option>`).join('')}</select></label>` : ''}</div>
      ${coverage.length > 1 ? `<details class="coverage"><summary>Compare publisher viewpoints <span>${coverage.length} reports · ${publishers.length} publishers</span></summary><div class="coverage-list">${coverage.map(item => `<section class="coverage-item"><div class="coverage-source">${escapeHTML(item.source)} <span>· ${escapeHTML(item.section)}</span></div><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.summary || item.description || 'Open the publisher for the full report.')}</p><a href="${escapeHTML(item.link)}" target="_blank" rel="noopener noreferrer">Read at ${escapeHTML(item.source)} ↗</a></section>`).join('')}</div></details>` : ''}
      ${(article.timeline || []).length > 1 ? `<details class="story-timeline"><summary>Story timeline <span>${article.timeline.length} reports</span></summary><ol>${article.timeline.map(item => `<li><time>In edition<br>${escapeHTML(formatDate(item.observedAt))}</time><div><b>${escapeHTML(item.source)}</b><p>${escapeHTML(item.title)}</p><small>Published ${escapeHTML(formatDate(item.date))}</small><br><a href="${escapeHTML(item.link)}" target="_blank" rel="noopener noreferrer">Open report ↗</a></div></li>`).join('')}</ol></details>` : ''}
    </article>`;
    })()}`).join('');
}

function renderPulse() {
  const articles = edition.articles || [];
  const sources = new Set(articles.flatMap(article => (article.coverage || [article]).map(item => item.source)));
  const compared = articles.filter(article => (article.coverage || [article]).length > 1);
  document.querySelector('#story-count').textContent = String(articles.length).padStart(2, '0');
  document.querySelector('#source-count').textContent = String(sources.size).padStart(2, '0');
  document.querySelector('#compare-count').textContent = String(compared.length).padStart(2, '0');
  const lead = compared.sort((a, b) => b.coverage.length - a.coverage.length)[0];
  document.querySelector('#pulse-note').textContent = lead
    ? `Most covered: “${lead.title}” appears in ${lead.coverage.length} reports.`
    : articles.length ? 'This edition currently has single-source reports. More perspectives may appear as feeds update.' : 'A daily snapshot of the stories we’re following.';
}

function renderPreferences() {
  const topicCounts = new Map();
  for (const article of edition.articles || []) for (const topic of topicsForArticle(article)) topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
  const topics = [...topicCounts.keys()].sort((a, b) => a.localeCompare(b));
  const sources = [...new Set((edition.articles || []).flatMap(article => (article.coverage || [article]).map(item => item.source)))].sort();
  const activeSourcePreferences = sourcePreferences && [...sourcePreferences].some(source => sources.includes(source)) ? sourcePreferences : null;
  document.querySelector('#topic-options').innerHTML = topics.map(topic => `<label><input type="checkbox" data-topic="${escapeHTML(topic)}" ${!topicPreferences || topicPreferences.has(topic) ? 'checked' : ''}><span>${escapeHTML(topic)}</span><small>${topicCounts.get(topic)}</small></label>`).join('') || '<small>Topics will appear when the edition loads.</small>';
  document.querySelector('#source-options').innerHTML = sources.map(source => `<label><input type="checkbox" data-source="${escapeHTML(source)}" ${!activeSourcePreferences || activeSourcePreferences.has(source) ? 'checked' : ''}><span>${escapeHTML(source)}</span></label>`).join('') || '<small>Sources will appear when the edition loads.</small>';
  const topicSummary = document.querySelector('#personalize-summary');
  if (topicSummary) topicSummary.textContent = followedTopics.size ? `Following ${followedTopics.size} topic${followedTopics.size === 1 ? '' : 's'} · ${topicPreferences ? 'filters' : 'all stories'}` : 'Follow topics from any story to shape your front page';
  const followed = document.querySelector('#followed-topics');
  if (followed) {
    followed.hidden = followedTopics.size === 0;
    followed.innerHTML = followedTopics.size ? `<span class="followed-label">FOLLOWING</span>${[...followedTopics].map(topic => `<button type="button" data-unfollow-topic="${escapeHTML(topic)}">${escapeHTML(topic)} <span aria-hidden="true">×</span></button>`).join('')}` : '';
  }
}

function renderRegion(continent) {
  const panel = document.querySelector('#region-panel');
  document.querySelectorAll('[data-continent]').forEach(button => {
    const selected = button.dataset.continent === continent;
    button.classList.toggle('selected', selected);
    if (button.tagName.toLowerCase() === 'g') button.setAttribute('aria-pressed', String(selected));
    else button.setAttribute('aria-pressed', String(selected));
  });
  if (!continent) {
    panel.innerHTML = '<div class="region-empty"><span class="region-empty-orbit">◎</span><span class="world-kicker">YOUR WORLD, IN CONTEXT</span><h3>Pick a place<br>to begin.</h3><p>Tap any continent on the globe to bring its top stories together.</p><div class="region-empty-meta"><span>01</span> CONTINENT AT A TIME</div></div>';
    return;
  }
  selectedContinent = continent;
  const articles = continentStories(continent);
  const isSpace = continent === 'Space';
  const countryName = countryPicker.selectedOptions[0]?.textContent || 'Global edition';
  const sourceCount = new Set(articles.flatMap(article => (article.coverage || [article]).map(item => item.source))).size;
  if (!articles.length) {
    panel.innerHTML = `<div class="region-panel-header"><span class="world-kicker">${isSpace ? 'SPACE DESK' : `VISITING ${escapeHTML(continent.toUpperCase())}`}</span><h3>${isSpace ? 'Beyond Earth' : escapeHTML(continent)}</h3><p>No ${isSpace ? 'space' : 'region'} stories in the ${escapeHTML(countryName)} yet.</p></div><div class="region-no-stories"><span>✧</span><b>${isSpace ? 'No space stories in this edition yet' : 'Keep exploring'}</b><p>${isSpace ? 'Refresh the daily edition to check for new reports on missions, astronomy and discoveries.' : 'Try another continent or refresh the edition when new regional reports arrive.'}</p><button type="button" data-clear-region>Back to the globe</button></div>`;
    addRegionCountryPicker(panel, continent);
    return;
  }
  panel.innerHTML = `<div class="region-panel-header"><div><span class="world-kicker">${isSpace ? 'SPACE DESK' : `VISITING ${escapeHTML(continent.toUpperCase())}`}</span><h3>${isSpace ? 'Beyond Earth' : `${escapeHTML(continent)}<span class="region-heading-dot">.</span>`}</h3><p>${articles.length < 10 ? `Showing ${articles.length} ${isSpace ? 'space' : 'region'}-matched ${articles.length === 1 ? 'story' : 'stories'}` : 'The top 10 stories'} · ${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'} · ${escapeHTML(countryName)}</p></div><button type="button" class="region-clear" data-clear-region aria-label="Clear ${isSpace ? 'space news' : 'continent selection'}">×</button></div><ol class="region-story-list">${articles.map((article, index) => `<li class="region-story"><span class="region-rank">${String(index + 1).padStart(2, '0')}</span><article>${article.image ? `<a class="region-thumbnail" href="${escapeHTML(article.link)}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true"><img src="${escapeHTML(article.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.region-thumbnail').remove()"></a>` : ''}<div class="region-story-copy"><span class="region-topic">${escapeHTML(article.section || 'World')}</span><h4>${escapeHTML(article.title)}</h4><p>${escapeHTML((article.summary || article.description || 'Open the original report for the full story.').slice(0, 175))}${(article.summary || article.description || '').length > 175 ? '…' : ''}</p><div class="region-story-meta"><span>${escapeHTML((article.coverage || [article]).map(item => item.source).join(' + '))}</span><span>·</span><span>${escapeHTML(formatDate(article.date))}</span><a href="${escapeHTML(article.link)}" target="_blank" rel="noopener noreferrer">Read ↗</a></div></div></article></li>`).join('')}</ol><div class="region-panel-foot"><span>END OF THE BRIEFING</span><span>${String(articles.length).padStart(2, '0')} STORIES, ${sourceCount} ${sourceCount === 1 ? 'SOURCE' : 'SOURCES'}</span></div>`;
  addRegionCountryPicker(panel, continent);
  if (isSpace) panel.querySelector('.region-panel-header').insertAdjacentHTML('afterend', '<figure class="space-hero"><img src="https://images-assets.nasa.gov/image/s114e7235/s114e7235~large.jpg" alt="International Space Station photographed against the colorful Earth from the space shuttle Discovery" loading="lazy" referrerpolicy="no-referrer"><figcaption><a href="https://images.nasa.gov/details/s114e7235" target="_blank" rel="noopener noreferrer">ISS during the STS-114 flyaround · NASA</a></figcaption></figure>');
}

function addRegionCountryPicker(panel, continent) {
  if (continent === 'Space') return;
  const label = document.createElement('label');
  label.className = 'region-country-picker';
  label.append(document.createTextNode('Read a country edition'));
  const select = document.createElement('select');
  select.dataset.regionCountry = '';
  select.setAttribute('aria-label', `Choose a country in ${continent}`);
  select.add(new Option(`${continent} · global stories`, ''));
  for (const code of CONTINENT_COUNTRIES[continent] || []) {
    const countryName = countryPicker.querySelector(`option[value="${code}"]`)?.textContent || COUNTRY_CONTEXT[code]?.[0] || code;
    select.add(new Option(`${countryName} edition`, code));
  }
  select.value = currentCountry;
  label.append(select);
  panel.querySelector('.region-panel-header').after(label);
}

function showWorldDesk(show) {
  const main = document.querySelector('main');
  const desk = document.querySelector('#world-desk');
  main.classList.toggle('world-mode', show);
  desk.hidden = !show;
  document.querySelector('#world-explorer-trigger').classList.toggle('active', show);
  savePageView();
  if (show) desk.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function savePreferences() {
  const checkedTopics = [...document.querySelectorAll('[data-topic]:checked')].map(input => input.dataset.topic);
  const checkedSources = [...document.querySelectorAll('[data-source]:checked')].map(input => input.dataset.source);
  topicPreferences = checkedTopics.length === document.querySelectorAll('[data-topic]').length ? null : new Set(checkedTopics);
  sourcePreferences = checkedSources.length === document.querySelectorAll('[data-source]').length ? null : new Set(checkedSources);
  localStorage.setItem('daily-edition-preferences', JSON.stringify({ topics: topicPreferences ? [...topicPreferences] : null, sources: sourcePreferences ? [...sourcePreferences] : null }));
  render();
}

function encodeBase64Url(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function decodeSharedEdition(encoded) {
  const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

async function encodeSharedEdition(snapshot) {
  const stream = new Blob([JSON.stringify(snapshot)]).stream().pipeThrough(new CompressionStream('gzip'));
  return encodeBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

async function loadEdition(manual = false) {
  // Re-rendering the stories can change page height. Keep the reader at the
  // same place, including when the world desk or a continent is open.
  const savedScrollY = window.scrollY;
  if (manual) {
    document.querySelector('#refresh').innerHTML = '↻ <span>Checking…</span>';
    try { await fetch('/api/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: currentCountry || null }) }); } catch { /* The edition request below reports connectivity. */ }
  }
  try {
    let nextEdition;
    if (sharedEditionSnapshot) nextEdition = await decodeSharedEdition(sharedEditionSnapshot);
    else {
      const response = await fetch(sharedEditionId
        ? `/api/share/${encodeURIComponent(sharedEditionId)}`
        : `/api/edition${currentCountry ? `?country=${encodeURIComponent(currentCountry)}` : ''}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Edition service is unavailable');
      nextEdition = await response.json();
    }
    if (sharedEditionId || sharedEditionSnapshot) currentCountry = nextEdition.country || '';
    if (edition.updatedAt !== nextEdition.updatedAt || edition.country !== nextEdition.country) displayArticles = null;
    edition = nextEdition;
    const countryName = countryPicker.selectedOptions[0]?.textContent;
    const editionLabel = currentCountry ? `${countryName} edition · ` : '';
    if (sharedEditionId || sharedEditionSnapshot) updated.textContent = `Shared edition · ${formatDate(nextEdition.updatedAt)} · ${nextEdition.articles.length} stories`;
    else if (edition.updatedAt) updated.textContent = `${editionLabel}Published ${formatDate(edition.updatedAt)} · ${edition.articles.length} stories`;
    else updated.textContent = edition.status || 'Waiting for the first edition';
    notice.hidden = sharedEditionId || sharedEditionSnapshot ? false : !edition.status || edition.status === 'Edition ready';
    if (sharedEditionId || sharedEditionSnapshot) notice.innerHTML = 'You are reading a saved daily edition. <a href="/">Return to today’s live edition</a>.';
    else notice.textContent = edition.status || '';
    renderPreferences();
    renderPulse();
    updateLocalClock();
    updateLocalWeather();
    if (sharedEditionId || sharedEditionSnapshot) { document.querySelector('#refresh').hidden = true; document.querySelector('#country-picker').hidden = true; document.querySelector('#share-edition').hidden = true; }
    render();
    if (selectedContinent) renderRegion(selectedContinent);
  } catch (error) {
    notice.hidden = false;
    notice.textContent = 'Could not connect to the edition server. Start it with npm start and try again.';
    updated.textContent = 'Edition unavailable';
  } finally {
    document.querySelector('#refresh').innerHTML = '↻ <span>Refresh</span>';
    const targetScrollY = restoredInitialView ? savedScrollY : initialScrollY;
    restoredInitialView = true;
    requestAnimationFrame(() => window.scrollTo({ top: targetScrollY, left: 0, behavior: 'auto' }));
  }
}

async function applyReaderMode() {
  const button = document.querySelector('#apply-reader-mode');
  const status = document.querySelector('#reader-status');
  if (!edition.articles?.length) { status.textContent = 'Wait for today’s edition to finish loading.'; return; }
  button.disabled = true;
  button.innerHTML = '<span class="reader-spinner"></span> Preparing';
  const kids = document.querySelector('#kids-mode').checked;
  const language = document.querySelector('#language-picker').value;
  status.textContent = language === 'English'
    ? 'Making a simpler English edition…'
    : `Translating headlines and briefs into ${language}. This may take a little while…`;
  const preparedArticles = edition.articles.map(article => kids ? {
    ...article,
    title: simplifyForKids(article.title),
    summary: simplifyForKids(article.summary || article.description || ''),
    kidFriendly: true
  } : article);
  try {
    let byId = new Map();
    let failed = 0;
    let providerIssue = '';
    if (language !== 'English') {
      const response = await fetch('/api/translate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, articles: preparedArticles })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'The free translation service is unavailable.');
      byId = new Map(payload.stories.map(story => [story.id, story]));
      failed = payload.failed || 0;
      providerIssue = payload.providerIssue || '';
    }
    displayArticles = preparedArticles.map((article, id) => ({ ...article, ...(byId.get(id) || {}) }));
    render();
    const translatedCount = language === 'English' ? 0 : (edition.articles.length - failed);
    status.textContent = failed
      ? translatedCount === 0
        ? `${kids ? 'Kid-friendly wording applied. ' : ''}The free translation service could not translate this language${providerIssue ? ` (${providerIssue})` : ''}. Try again later or choose another language; the original text is still available.`
        : `${kids ? 'Kid-friendly wording applied. ' : ''}${translatedCount} of ${edition.articles.length} stories translated into ${language}; ${failed} remain in their original language.`
      : `${kids ? 'Kid-friendly wording applied with a built-in glossary. ' : ''}${language === 'English' ? 'Showing English.' : `All ${translatedCount} stories translated into ${language}.`} Source comparison stays in the publisher’s original language.`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
    button.innerHTML = 'Apply <span>→</span>';
  }
}

document.querySelectorAll('.nav button[data-filter]').forEach(button => button.addEventListener('click', () => {
  showWorldDesk(false);
  selectedContinent = null;
  renderRegion(null);
  currentFilter = button.dataset.filter;
  savePageView();
  document.querySelectorAll('.nav button').forEach(item => item.classList.toggle('active', item === button));
  render();
}));
document.querySelector('#world-explorer-trigger').addEventListener('click', () => showWorldDesk(true));
document.querySelector('#world-back').addEventListener('click', () => showWorldDesk(false));
document.querySelector('#world-back-bottom').addEventListener('click', () => showWorldDesk(false));
document.querySelector('#continent-shortcuts').innerHTML = CONTINENTS.map((continent, index) => `<button type="button" data-continent="${escapeHTML(continent)}" aria-pressed="false"><span>0${index + 1}</span>${escapeHTML(continent)}</button>`).join('');
function chooseContinent(continent) {
  if (!CONTINENTS.includes(continent)) return;
  selectedContinent = continent;
  savePageView();
  renderRegion(continent);
  document.querySelector('#region-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
document.querySelector('.earth-globe').addEventListener('click', event => {
  if (event.target.closest('[data-space-desk]')) { selectedContinent = 'Space'; savePageView(); renderRegion('Space'); document.querySelector('#region-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const continent = event.target.closest('[data-continent]');
  if (continent) chooseContinent(continent.dataset.continent);
});
document.querySelector('.earth-globe').addEventListener('keydown', event => {
  if (event.target.closest('[data-space-desk]') && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectedContinent = 'Space'; savePageView(); renderRegion('Space'); document.querySelector('#region-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const continent = event.target.closest('[data-continent]');
  if (continent && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); chooseContinent(continent.dataset.continent); }
});
document.querySelector('#continent-shortcuts').addEventListener('click', event => {
  const button = event.target.closest('[data-continent]');
  if (button) chooseContinent(button.dataset.continent);
});
document.querySelector('#region-panel').addEventListener('click', event => {
  if (event.target.closest('[data-clear-region]')) { selectedContinent = null; savePageView(); renderRegion(null); }
});
document.querySelector('#region-panel').addEventListener('change', event => {
  if (!event.target.matches('[data-region-country]')) return;
  currentCountry = event.target.value;
  countryPicker.value = currentCountry;
  localStorage.setItem('daily-edition-country', currentCountry);
  savePageView();
  updateLocalClock();
  updateLocalWeather(true);
  loadEdition();
});
stories.addEventListener('click', event => {
  const followButton = event.target.closest('[data-follow-topic]');
  if (followButton) {
    const topic = followButton.dataset.followTopic;
    if (followedTopics.has(topic)) followedTopics.delete(topic); else followedTopics.add(topic);
    localStorage.setItem('daily-edition-followed-topics', JSON.stringify([...followedTopics]));
    renderPreferences();
    render();
    return;
  }
  const button = event.target.closest('[data-save]');
  if (!button) return;
  const link = button.dataset.save;
  if (savedStories.has(link)) { savedStories.delete(link); savedArticles.delete(link); }
  else {
    const article = (displayArticles || edition.articles).find(item => item.link === link);
    if (article) { savedStories.add(link); savedArticles.set(link, article); }
  }
  localStorage.setItem('daily-edition-saved', JSON.stringify([...savedArticles.values()]));
  render();
});
stories.addEventListener('change', event => {
  if (!event.target.matches('[data-story-folder]')) return;
  const link = event.target.dataset.storyFolder;
  if (event.target.value === 'Unfiled') savedFolders.delete(link);
  else savedFolders.set(link, event.target.value);
  localStorage.setItem('daily-edition-folders-by-story', JSON.stringify(Object.fromEntries(savedFolders)));
});
document.querySelector('#followed-topics').addEventListener('click', event => {
  const button = event.target.closest('[data-unfollow-topic]');
  if (!button) return;
  followedTopics.delete(button.dataset.unfollowTopic);
  localStorage.setItem('daily-edition-followed-topics', JSON.stringify([...followedTopics]));
  renderPreferences();
  render();
});
document.querySelector('#saved-folder-filter').addEventListener('change', event => { activeSavedFolder = event.target.value; render(); });
document.querySelector('#new-folder-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = document.querySelector('#new-folder-name');
  const folder = input.value.trim();
  if (!folder || savedFoldersList.some(name => name.toLocaleLowerCase() === folder.toLocaleLowerCase())) return;
  savedFoldersList.push(folder);
  localStorage.setItem('daily-edition-folders', JSON.stringify(savedFoldersList));
  activeSavedFolder = folder;
  input.value = '';
  render();
});
document.querySelector('#lead-story').addEventListener('click', event => {
  const followButton = event.target.closest('[data-follow-topic]');
  if (followButton) {
    const topic = followButton.dataset.followTopic;
    if (followedTopics.has(topic)) followedTopics.delete(topic); else followedTopics.add(topic);
    localStorage.setItem('daily-edition-followed-topics', JSON.stringify([...followedTopics]));
    renderPreferences();
    render();
    return;
  }
  const chip = event.target.closest('[data-trend]');
  if (!chip) return;
  currentFilter = 'All';
  document.querySelector('#story-search').value = chip.dataset.trend;
  document.querySelectorAll('.nav button').forEach(button => button.classList.toggle('active', button.dataset.filter === 'All'));
  render();
  document.querySelector('#stories').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
countryPicker.addEventListener('change', () => {
  currentCountry = countryPicker.value;
  localStorage.setItem('daily-edition-country', currentCountry);
  currentFilter = 'All';
  savePageView();
  document.querySelectorAll('.nav button').forEach(button => button.classList.toggle('active', button.dataset.filter === 'All'));
  selectedContinent = null;
  renderRegion(null);
  updateLocalClock();
  updateLocalWeather(true);
  loadEdition();
});
function applyReaderSettings() {
  document.body.dataset.textSize = ['default', 'large', 'largest'][textScale];
  document.body.classList.toggle('high-contrast', highContrast);
  document.querySelector('#text-smaller').disabled = textScale === 0;
  document.querySelector('#text-larger').disabled = textScale === 2;
  document.querySelector('#contrast-toggle').setAttribute('aria-pressed', String(highContrast));
  document.querySelector('#contrast-toggle').textContent = highContrast ? '✓ High contrast' : '◐ High contrast';
}
applyReaderSettings();
document.querySelector('#text-smaller').addEventListener('click', () => {
  textScale = Math.max(0, textScale - 1);
  localStorage.setItem('daily-edition-text-scale', String(textScale));
  applyReaderSettings();
});
document.querySelector('#text-larger').addEventListener('click', () => {
  textScale = Math.min(2, textScale + 1);
  localStorage.setItem('daily-edition-text-scale', String(textScale));
  applyReaderSettings();
});
document.querySelector('#contrast-toggle').addEventListener('click', () => {
  highContrast = !highContrast;
  localStorage.setItem('daily-edition-high-contrast', String(highContrast));
  applyReaderSettings();
});
document.querySelector('#share-edition').addEventListener('click', async () => {
  const status = document.querySelector('#share-status');
  const button = document.querySelector('#share-edition');
  if (!edition.articles?.length) { status.textContent = 'Wait for today’s edition to load before sharing it.'; return; }
  button.disabled = true;
  status.textContent = 'Saving this edition…';
  try {
    const shareUrl = new URL(location.href);
    shareUrl.search = '';
    shareUrl.hash = '';
    let shareMessage = 'Saved daily edition';
    try {
      const response = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ edition: { updatedAt: edition.updatedAt, country: currentCountry || null, articles: edition.articles } }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save this edition.');
      shareUrl.searchParams.set('edition', result.id);
    } catch {
      const snapshot = { id: 'link', updatedAt: edition.updatedAt, country: currentCountry || null, articles: edition.articles };
      shareUrl.hash = `edition-snapshot=${await encodeSharedEdition(snapshot)}`;
      shareMessage = 'Edition link ready';
    }
    const link = document.querySelector('#share-link');
    link.value = shareUrl.href;
    link.hidden = false;
    try {
      await navigator.clipboard.writeText(shareUrl.href);
      status.textContent = `${shareMessage} · link copied`;
    } catch {
      status.textContent = `${shareMessage} · copy the selected link`;
      link.focus();
      link.select();
    }
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});
document.querySelector('#refresh').addEventListener('click', () => loadEdition(true));
document.querySelector('#apply-reader-mode').addEventListener('click', applyReaderMode);
document.querySelector('#story-search').addEventListener('input', render);
document.querySelector('#topic-options').addEventListener('change', savePreferences);
document.querySelector('#source-options').addEventListener('change', savePreferences);
document.querySelector('#reset-preferences').addEventListener('click', () => {
  topicPreferences = null;
  sourcePreferences = null;
  localStorage.removeItem('daily-edition-preferences');
  renderPreferences();
  render();
});
document.querySelector('#today').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()).toUpperCase();
document.querySelectorAll('.nav button[data-filter]').forEach(button => button.classList.toggle('active', button.dataset.filter === currentFilter));
if (savedPageView.worldMode) {
  document.querySelector('main').classList.add('world-mode');
  document.querySelector('#world-desk').hidden = false;
  document.querySelector('#world-explorer-trigger').classList.add('active');
}
window.addEventListener('beforeunload', savePageView);
fetch('/api/countries').then(response => response.json()).then(countries => {
  for (const country of countries) {
    const option = document.createElement('option');
    option.value = country.code;
    option.textContent = country.name;
    countryPicker.append(option);
  }
  if (![...countryPicker.options].some(option => option.value === currentCountry)) currentCountry = '';
  countryPicker.value = currentCountry;
}).catch(() => { currentCountry = ''; }).finally(() => {
  if (!currentCountry) countryPicker.value = '';
  loadEdition();
});
updateLocalClock();
setInterval(updateLocalClock, 1000);
if (!sharedEditionId) setInterval(loadEdition, 10000);
