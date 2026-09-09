# Persistent article views

The counter uses a private Vercel Function and an Upstash Redis database. The
database belongs to the site owner and survives application deployments.

## Connect storage

1. Open the existing **margins-website** Vercel project.
2. Open **Storage**, choose **Create Database**, and select **Upstash for Redis**.
3. Choose the plan and region in the provider screen, then connect the database
   to **margins-website**, **Production**. Review any plan charges before accepting.
4. The integration should add `KV_REST_API_URL` and `KV_REST_API_TOKEN`. The code
   also accepts `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from an
   existing Upstash database. These values must remain private environment
   variables; never paste them into HTML, a commit, or a chat.
5. Redeploy the latest main commit so the function receives the variables.

`GET /api/views` returns `{"ready":true}` when production credentials are present.
An actual visit must still succeed to verify the database connection. Before
configuration, the endpoint returns `{"ready":false}` and the page hides the
counter. Provider failures never turn an existing number into a fake zero.

Do not enable key eviction on the database: this is persistent storage, not an
expendable cache. Keep backups or analytics exports for recovery. Deleting the
database or changing the permanent article ID changes which total is available.

## What counts

- Opening an article in a visible tab adds one page view.
- Refreshing adds one page view. Returning from the browser's back/forward cache
  also adds one view when the article becomes visible again.
- A background/prerendered page counts when it becomes visible.
- A network retry uses the same page-load ID and does not add a second view.
- Reading totals with GET, visiting the homepage or listings, and preview
  deployments do not increment production totals.
- Homepage story cards show the same stored totals using GET requests. Returning
  to the homepage through browser history refreshes those totals without adding
  article views.
- Known crawler, preview and headless user agents are filtered on a best-effort
  basis. A public counter cannot authenticate every visitor as a human.
- This is **page views**, including repeat visitors, not unique readers, reading
  completion, subscribers, or a measure of impact. JavaScript blocking and
  network failure can prevent a view being recorded.

The browser sends only the permanent article ID and a random page-load ID. This
counter stores no email addresses, persistent visitor cookies, or IP addresses.
The hosting provider may keep its normal request logs independently.

## Initial value and historical imports

New articles start at zero. There is no fixed starting number in the client,
HTML, article JSON, environment, or build script. Successful first visits show 1.
Counts use stable Redis keys (`margins:article-views:{article-id}`), and those
article hashes never expire. Only deduplication IDs expire after 24 hours.

If a previous analytics export supports an initial total, import that genuine
historical number **once per article**, with the report's cutoff and source.
Newly recorded views remain separate and are not overwritten. The operation
rejects a reporting period that overlaps the live counter's start date. The
public response distinguishes historical and newly recorded views, and the
counter tooltip identifies included historical totals.

Create a private JSON array with `id`, `views` (integer), `through` (ISO timestamp)
and `source` (report/export description) for each article. Use measured page
views, not an arbitrary display offset, and keep the supporting export.

```sh
node --env-file=.env.local scripts/import-article-views.cjs historical-views.json
```

This owner-only script is never run by a deployment and is not a public API.
Importing twice is rejected. The displayed total is historical plus recorded;
the import cannot reset the recorded portion.

## Verify after connecting

1. Open an article on the production domain. The byline should show its views.
2. Refresh once and confirm the count increases by one.
3. Read `/api/views?id=after-wang-fuk-court` twice; GET must not change the total.
4. Open a second article and confirm it has its own total.
5. Redeploy unchanged code, read the total before revisiting the article, and
   confirm it is retained. Opening the article itself should add the next view.

Use a separate analytics product (for example Vercel Web Analytics or Google
Analytics) for unique visitors, acquisition sources and reading engagement.
Use Google Search Console for organic search impressions, queries and clicks.
