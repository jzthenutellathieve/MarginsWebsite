# Member accounts and Field Notes

The static journal remains usable without any community service. Member features are **disabled by default**. They are not live merely because this code has been deployed. No Supabase project, email delivery service or production credentials were provisioned as part of this change.

## Activate after configuring the service

1. Create a Supabase project and run `supabase/community.sql` in its SQL editor. It creates the private `community-media` bucket, community tables, service-only RPCs and access restrictions. It can be rerun for this initial schema version; later schema changes require migrations.
2. Enable Supabase email authentication. Configure custom SMTP for public member email delivery. Supabase's default email service is restricted and is not a production public-signup mail service. In the Magic Link email template, include `{{ .Token }}` so readers receive a code they can enter on the website. Set the site URL to `https://themarginsjournals.com`; use a short OTP expiry and Supabase's auth rate limits. Never put private API credentials in an email template.
3. Set production-only server environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `COMMUNITY_ENABLED=true`. For this REST adapter, use Supabase’s **legacy JWT-based `anon` and `service_role` API keys** from the project API settings. It sends those keys as both `apikey` and an `Authorization: Bearer` credential; newer `sb_publishable_…` and `sb_secret_…` keys are not supported by this implementation. Keep `COMMUNITY_ENABLED=false` and omit production credentials from preview environments. The browser never receives these keys.
4. Confirm `/api/community?action=status` returns `{"ready":true}`. This performs a real database/schema request. Missing configuration, a failed connection or preview deployment reports `ready:false`; the existing journal and email contribution path remain available.
5. Sign in with the verified owner's email, `xingtong.themargins@gmail.com`. The SQL owner-sync function checks Supabase's verified email before adding the administrator. Neither a chosen display name nor user metadata can assign administrator rights. The verified owner is automatically treated as an approved member. Existing static members are not automatically linked to new accounts or claimed by a matching display name.
6. Before opening signup to readers, use separate test accounts to check email delivery, code verification, membership requests and approval, own submissions, editor review, approved notes and comments, signed photos, likes, retry-safe view counts and logout. Inspect the provider dashboard for storage limits and email delivery failures. The local test suite does not replace this live service check.

Vercel must package `content/field-notes/*.json` with `api/community.js`. Existing static note IDs are registered as approved targets lazily from those trusted files. Member submissions never write source JSON or trigger a site rebuild.

## API and privacy boundaries

All actions use `/api/community?action=…`. Mutations require JSON and the production website Origin. Cross-site mutations and preview writes are refused. Access and refresh tokens are in `__Host-` cookies marked `HttpOnly`, `Secure`, `SameSite=Lax`; responses are private and not cached. Supabase validates the user behind a session. Tokens, user email addresses and provider error details are not returned in community responses.

- Public reads: `status`, `feed`, and `note&id=…` for an approved static or member note.
- Account reads: `session`, `mine`; `review` is owner-only and includes `requests` alongside notes and comments. Session and verification return `membership: 'none'|'pending'|'approved'|'rejected'` and `isMember` in the user object. Signing in creates a reader account; it does not automatically grant membership.
- Auth writes: `request-code {email}`, `verify {email,token,name?}`, `logout {}`. Code requests give the same generic response for supported client/provider validation cases.
- `request-membership {message}` lets a signed-in reader ask to become a member; the message is at most 1,000 characters. Requests remain pending until the owner approves them. A rejected reader may submit a new request, subject to a limit of three requests per account per hour. Already-approved members remain approved. The existing public member directory stays curated separately.
- Interaction writes: `like {id,liked}`, `comment {id,text}`, `view {id,eventId}`. Views count page-view events, not unique people. Retries reuse the same UUID and are deduplicated for 24 hours; totals persist independently of receipts.
- Only approved members or the verified owner may upload images or submit Field Notes. Any verified reader account may like or comment. Full articles are sent to `xingtong.themargins@gmail.com` for editorial consideration; this feature does not add an article CMS.
- `upload {base64,mime}` accepts JPEG, PNG or WebP up to 2 MiB decoded, with matching signatures and bounded image dimensions. It returns a private, account-owned path, not a public URL.
- `submit {title,text,date,media:[{path,alt}],permission:true}` allows titles up to 120 characters, text up to 4,000, and 0–4 photos. Text is required when there are no photos. The server owns author identity and publication status. Only the uploader's unused paths can be attached. Submitted notes and comments remain pending until approved.
- `moderate {kind:'note'|'comment'|'membership',id,approve}` requires the verified owner. For membership, `id` is the requesting user's UUID and approval changes their membership status; for notes and comments it changes publication visibility atomically.

Content is plain text, including titles, display names, image descriptions and comments. The client must render it with `textContent`, never `innerHTML`. Chosen names are display labels, not proof of identity or links to the existing static member list.

Private uploads are signed only when an approved note is read, or its owner/editor views the submission. Signed links last one hour; reload the feed or account page if an old photo link expires. Existing issued links can remain valid until expiry after a post is rejected; they are not permanent public bucket URLs. Rejected or unattached uploads are not publicly listed. Establish an administrative retention policy for abandoned uploads and old rate-limit rows before sustained public use.

Rate limits are shared in Postgres across server instances. Likes use a unique account/note key and an atomic desired-state RPC. View deduplication, media ownership/claiming and moderation also use transactions. All community tables use RLS with access revoked from browser database roles; only server service-role requests can access them. Storage is private with restrictive policies guarding against broad policies on unrelated buckets.

## Verification completed locally

`node --test test/community.test.cjs` tests the handler with injected providers: disabled and preview behavior, provider/schema failure, Origin and JSON checks, real-user requirements, metadata role rejection, reader/member separation, membership requests and owner-only approval, reapplication after rejection, secure cookies, unpublished content isolation, account-owned media, moderation boundaries, pending comments, text-as-data, limits, retry semantics and atomic-RPC routing. No real OTP emails are sent by these tests. SQL was parsed, but has not been executed against a configured Supabase project. Production auth, database transactions and email delivery must still be verified during setup.

Official setup references:

- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/storage/buckets/fundamentals
