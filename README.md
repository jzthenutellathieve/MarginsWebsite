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

The homepage introduces The Margins as a shared project. A featured article and
Field Notes sit side by side, followed by concise project links and a compact
list of other articles. The original journal typography and navigation remain.

Field Notes are stored as one JSON file per entry in `content/field-notes/` and
rendered in date order at `/field-notes/`. The newest note appears beside the featured article on the homepage.
Upload note photos into `public/field-notes/<entry-id>/`. A date such as `2025-08`
records the month of the visit/photos; it is not a backdated publication claim.

Members live in `content/members.json`. Add supplied portraits to `public/members/`
and set each member's `avatar` path, or leave it null. An entry's `author` must
match a member ID. Their byline links to the Contributors section of `/about/`. Each profile
includes a role, without follower or following counts. Research mentorship
is acknowledged separately under Special thanks.

The public contribution button opens an email draft addressed to Jerry. Visitors
attach photos and provide a place, month, caption and credit. This is an editorial
submission flow, not account-based self-publishing. Submissions are reviewed and
added to the repository before appearing on the site.

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
