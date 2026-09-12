# The Margins

A static journal with independent article and project pages, deployed to the existing Vercel project.

## Content and pages

- `content/articles/`: one JSON file per article, including its text, references, dates and image descriptions.
- `content/pages/`: homepage, article index, archive, Field Notes, about page and project pages.
- `templates/`: shared navigation, footer, newsletter form and water-project media.
- `public/`: shared CSS, small interaction scripts and the exact images extracted from the original site.
- `images/`: original source images, retained unchanged.

Run `npm run build` to generate the deployable `dist/` directory. Every article is a separate HTML document at `/articles/{id}/`. Links use normal browser navigation, and the full text is readable without JavaScript. Old `#/reporting/{id}` bookmarks redirect to the matching article.

## Journal sections

The homepage opens with a short introduction to Jerry's ongoing journal. Articles, Field Notes and Projects share the existing navigation and visual design. `/field-notes/` introduces the planned section, with no published notes yet; the homepage's Field Notes row makes that status explicit. When the first real note is ready, replace the introductory state with the dated note and its credited photographs, and update the homepage row. Do not turn example topics or planned visits into published entries.

## Adding an article

Create a JSON file in `content/articles/` using an existing article as a guide. The `id` is the permanent URL slug. Use `title` for the full search/share title, `displayTitle` for the short main headline, `deck` for its subtitle, and `subtitle` for the introduction shared by the homepage, listings and article. `format`, `region` and `tag` describe the article in listings. Keep image captions and credits with the image content blocks and register image files in `content/assets.json`.

The build automatically places published article files into:

- The homepage: one feature selected by `featuredArticle` in `content/site.json`, plus the four most recent other stories.
- `/articles/`: six articles per page, newest first, with automatically generated topic pages and a small metadata search index.
- `/archive/`: twelve compact entries per page, grouped by year, with individual year pages.
- Related reading at the end of each article, and the sitemap.

The first two photos of a story alternate every three seconds on the homepage. Readers can pause or change photos; rotation stops offscreen, while the browser tab is hidden, and while hovering or using the keyboard. Reduced-motion preferences disable automatic rotation and page-transition effects. Search enhances the static directories; all topic, year and pagination links also work without JavaScript.

Do not edit generated files in `dist/`. Edit the appropriate content file, update `feed.xml` with `python3 scripts/build_feed.py` when adding an article, then commit the changes. `sitemap.xml` is generated during every build. `npm test` checks page generation, old links, article content and the newsletter request behavior.

## Newsletter

Vercel also deploys `api/newsletter.js`. Private credentials remain in Vercel environment variables. Keep `NEWSLETTER_ENABLED=false` until the Mailchimp Event API flow is configured and ready for a real delivery test. With the flag disabled, the existing hosted Mailchimp form remains available on every page.

See `EMAIL-SETUP.md` for the welcome-email setup and `RSS-SETUP.md` for article notifications. The code tests use mock Mailchimp responses and do not send email.

## Article page views

`api/views.js` records article page loads in an external Redis database. Totals
are independent of the generated site and are not reset by builds or deploys.
The small byline counter appears after storage is connected; missing credentials
or provider errors leave it hidden. See `VIEWS-SETUP.md` for connection,
historical imports and the exact counting method.
