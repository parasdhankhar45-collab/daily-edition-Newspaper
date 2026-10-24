# The Daily Edition

A newspaper-style news reader that assembles headlines from publisher RSS feeds and refreshes its edition every 24 hours. It keeps the latest saved edition if a source is temporarily unavailable. Story links go directly to the publisher.

## Features

- Explore a rotating Earth globe, choose a continent or country edition, and open a dedicated space news desk.
- Follow topics and publishers to personalize the front page; search stories and save them into reading-list folders.
- Compare coverage from multiple publishers and follow story timelines across editions.
- Read short context notes, publication freshness, country local time, and capital-city weather.
- Use translation, kid-friendly wording, text-size and contrast controls, and share a saved daily edition.
- Keep reader preferences and saved stories in the browser. Edition feeds, story timelines, and server-backed share snapshots are stored in `data/` at runtime; this folder is excluded from Git.

Related headlines from different publishers are grouped into one story card using a conservative title-word similarity check. Expand **Compare coverage** to see each publisher's headline, brief, and original link. This helps readers compare reporting directly; the grouping is heuristic and can miss related stories or occasionally group similar headlines about different events.

Readers can use **News from** to choose a country edition. Country editions use Google News RSS localized for that country, with separate World, Business, Technology, Science, and Culture feeds. The choice is saved in the browser, and the server caches each country edition for 24 hours.

The reader tools translate headlines and summaries into English, Hindi, Spanish, French, Portuguese, German, Japanese, Arabic, Bengali, or Chinese. They try Google's no-key web translation endpoint, then free public LibreTranslate community instances. The Google endpoint is not a supported public API and may change; community instances can be slow, rate-limited, or unavailable. Headline and summary text is sent to these public translation services. If translation fails, the original text stays visible. Kid-friendly mode works offline with a small built-in word glossary and shorter sentence formatting; it does not generate or add new facts. Only headlines and short briefs are translated; the publisher comparison panel stays in the source language. You can set `LIBRETRANSLATE_URL` to a different compatible instance.

The **Personalize my edition** panel lets each browser choose topics and publishers; these preferences are stored locally. Story timelines combine current publisher coverage with edition snapshots collected over the previous 14 days. A timeline starts building when the server first refreshes after this feature is installed.

## Run locally

Requires Node.js 20 or later. In this folder, run:

```sh
npm start
```

Then open <http://localhost:3000>. The first edition is fetched on startup; later refreshes run every 24 hours. The **Refresh** button reloads the page's view; the scheduled feed fetch still runs once per day.

In Windows PowerShell, if script execution blocks `npm`, run `npm.cmd start` instead.

## Sources and publishing

The starter edition uses BBC News RSS feeds for World, Business, Technology, and Science, plus The Guardian feeds for World and Culture. The feed list is in `server.js` and can be expanded with sources whose terms allow your intended use. This is a curated feed aggregator, not an exhaustive index of every news site. It displays headlines and excerpts with links to the original publisher rather than republishing full articles.

To make it available online, deploy the Node server on a host that supports a continuously running Node process and persistent storage for `data/`. For a serverless host, move the daily refresh to its scheduled-job/cron feature and store editions, timelines, and shared snapshots in a database or object store.

