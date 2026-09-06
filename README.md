# The Margins

A static journal with independent article and project pages, deployed to the existing Vercel project.

## Content and pages

- `content/articles/`: one JSON file per article, including its text, references, dates and image descriptions.
- `content/pages/`: homepage, article index, archive, about page and project pages.
- `templates/`: shared navigation, footer, newsletter form and water-project media.
- `public/`: shared CSS, small interaction scripts and the exact images extracted from the original site.
- `images/`: original source images, retained unchanged.

Run `npm run build` to generate the deployable `dist/` directory. Every article is a separate HTML document at `/articles/{id}/`. Links use normal browser navigation, and the full text is readable without JavaScript. Old `#/reporting/{id}` bookmarks redirect to the matching article. The shared stylesheet preserves the original design.

Do not edit generated files in `dist/`. Edit the appropriate content file, update `feed.xml` with `python3 scripts/build_feed.py` when adding an article, then commit the changes. `sitemap.xml` is generated during every build. `npm test` checks page generation, old links, article content and the newsletter request behavior.

## Newsletter

Vercel also deploys `api/newsletter.js`. Private credentials remain in Vercel environment variables. Keep `NEWSLETTER_ENABLED=false` until the Mailchimp Event API flow is configured and ready for a real delivery test. With the flag disabled, the existing hosted Mailchimp form remains available on every page.

See `EMAIL-SETUP.md` for the welcome-email setup and `RSS-SETUP.md` for article notifications. The code tests use mock Mailchimp responses and do not send email.
