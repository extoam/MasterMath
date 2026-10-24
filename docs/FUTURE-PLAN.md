# MasterMath: plan for hosting, storing data, and opening it to more children

October 24, 2026 · for the owner and anyone who builds the next stages

## Where it stands today

MasterMath is a web app for one child on one tablet. It is hosted for free on GitHub Pages at <https://extoam.github.io/MasterMath/>, and the code is public at <https://github.com/extoam/MasterMath>. The app installs to the tablet’s home screen and works with no network.

All of her data lives only in the tablet browser’s storage (IndexedDB): her name, handwriting samples, worksheets, corrections, timings. Nothing is sent anywhere. This was a deliberate choice for one child: no accounts, no server, no cost, nothing to leak.

That choice has three limits, which this plan addresses in order:

1. **One device, no backup.** If the browser’s storage is cleared, or the tablet is lost or replaced, her progress is gone.
2. **The parent sees progress only on the tablet,** by holding the title on Home.
3. **One child.** There are no profiles, and nothing anyone else could sign up for.

## The principle that makes every stage easier

The data is already stored as **append-only records with unique ids**: worksheets, sides, correction rounds, handwriting samples. Nothing saved is ever changed, except the work in progress and the settings. This means syncing is simple. A device only ever has to upload records the server does not have yet, and download records it does not have yet. Nothing ever needs merging or conflict resolution. Every stage below keeps this property.

## Stage 1 · Backups without a server (small, next)

**Goal:** losing the tablet or clearing the browser never loses her progress.

- **Export and import a backup file.** The Parent view gets “Save a backup” and “Restore from a backup”. The file is one JSON document holding every record, a few hundred KB after months of use. On iPad and Huawei it can be saved to Files, iCloud Drive, or Google Drive, or emailed to yourself.
- **A gentle reminder.** Following the original spec, every tenth worksheet the Parent view shows when the last backup was made.
- **Restore on a new tablet.** Open the app, hold the title, Restore, pick the file. Her name, handwriting, and progress come back.
- **Ask the browser to keep the data.** Call `navigator.storage.persist()` on first run, so the browser is less likely to evict it when storage runs low.

Cost: none. Accounts: none. This alone removes most of the risk while the app has one user.

## Stage 2 · Hosting and storing data for your family (medium)

**Goal:** progress is safe in the cloud. You can see it from your phone or laptop. More than one child can use it.

### Profiles on one device

A first screen asking “Who is doing maths today?” with one card per child. Each child has their own name, handwriting, worksheets, and calendar. Locally this is one extra field (`childId`) on every record. This is worth doing before the server, because the server needs it anyway.

### A small backend

| Option | What it gives | Cost to start | Fit |
|---|---|---|---|
| **Supabase** (recommended) | Postgres database, sign-in, row-level security so each family only sees its own rows, file storage. EU and other regions. | Free tier; about $25 a month when it grows | Best fit: the records map straight onto tables, security is per row, and there is no server code to maintain |
| Cloudflare Workers with the D1 database | Very cheap, fast, same company as the hosting the spec first planned | Free tier | Good, but sign-in and access rules are written by hand |
| Firebase (Google) | Mature sign-in and offline sync | Free tier | Works, but the Google dependency and its pricing model are less predictable |

### How syncing works

- **The tablet stays the source of truth** and keeps working offline exactly as now.
- **Upload when the tablet is online.** New records are uploaded in the background. Each record’s id makes uploading twice harmless.
- **Download on a new or second device.** Records the device is missing are downloaded.
- **The draft does not sync.** The work in progress stays on the tablet it is being written on.
- **Handwriting strokes are optional to upload.** Strokes are the largest part of the data and the most personal. The default is to keep them on the device and upload only the answers and timings. A parent can switch on “back up handwriting too”.

### Parent dashboard on any device

A separate page that signs in with the parent’s account. It shows what the in-app Parent view shows today, for every child: the calendar, the correction plan, blocks and repeats, problems coming back, and time against the target.

### Hosting

GitHub Pages can stay for the app itself. A custom domain is about $12 a year, if wanted.

## Stage 3 · Public, for more children (large)

**Goal:** other families can sign up and use it safely. Four things must be settled first. The first two block a public launch.

### 1. The Kumon name and material (blocking)

The app follows Kumon’s Level B closely. It uses the sheet codes (B101a), the block titles, and the target times from Kumon’s published table, and “Kumon” appears in the code and documents. That is fine for a private tool for one child. It is not fine for a public product: Kumon is a trademark, and its curriculum tables are its own material.

Before going public:

- Remove the Kumon name everywhere users can see it.
- Give levels and sheets our own names and numbering.
- Write the block titles in our own words.
- Set target times from MasterMath’s own data instead of Kumon’s table.
- Describe the method in our own terms, for example “daily worksheets, corrections until 100%, small steps”.
- Get a short legal review of the final wording.

### 2. Children’s privacy law (blocking)

The users are children, so the strictest rules apply:

- **US:** the Children’s Online Privacy Protection Act (COPPA). It requires verifiable parental consent before collecting any data from a child under 13.
- **EU and UK:** the General Data Protection Regulation (GDPR, article 8) and the UK Age Appropriate Design Code. They require parental consent, data minimisation, high-privacy defaults, and no profiling.
- **UAE:** the Personal Data Protection Law (PDPL). It requires a lawful basis, rights to see and delete data, and rules for sending data abroad.

What that means in the product:

- **Accounts.** Accounts belong to parents only. A child never types an email or a password; children are profiles under the parent.
- **Consent.** A parent consents at sign-up, with a plain-language privacy notice that names every piece of data stored and why.
- **Minimal data.** Store the child’s first name or a nickname only, with no birthday, photo, or location. There are no analytics on children, no ads, and no third-party trackers.
- **Handwriting.** It stays on the device by default (see Stage 2).
- **Deletion and export.** One button deletes a child’s data everywhere; another gives the parent a copy.
- **Security.** Data is encrypted in transit and at rest, and per-family access rules are enforced in the database. Only the parent’s account can read a child’s records.
- **Data location.** Choose a hosting region that matches where most families live, and say where the data is stored.

### 3. Getting a new child started

- **Placement.** A short placement test on first use, as in the original spec, so a new child starts at the right level instead of B101.
- **More of the ladder.** Level A (addition and subtraction to 20) before B, and multiplication and division after it. The engine already supports any level: a level is a table of blocks with generators.
- **Handwriting.** Calibration stays per child. Later, with consent, a shared recogniser trained on many children’s digits would make the first days smoother.
- **Devices.** Test on common tablets (iPad, Samsung, Huawei) and with fingers as well as styluses. Fingers are rejected inside answer boxes today, which suits a stylus but not a finger.

### 4. Running it

- **Costs.** About $25–50 a month for the backend once there are hundreds of families, plus a domain.
- **Support.** A contact address, and a short help page for parents.
- **Updates.** The app updates itself the next time it opens online, as it does today. Database changes must be backward compatible, because tablets can stay offline for days.
- **Optional pricing.** A free tier for one child, with a small yearly fee for more children or for the dashboard. This is a decision for later; nothing in the plan depends on it.

## Suggested order

| Step | What | Size | Needs from you |
|---|---|---|---|
| 1 | Backup file, restore, persistent storage | Small, about a day | Nothing |
| 2 | Child profiles on one device | Small to medium | Nothing |
| 3 | Supabase project, parent sign-in, background sync of answers | Medium, about a week | A Supabase account; region choice |
| 4 | Parent dashboard on any device | Medium | Nothing |
| 5 | Remove Kumon naming and material; our own levels and targets | Medium | Final wording; a legal review |
| 6 | Consent flow, privacy notice, delete and export | Medium | Privacy notice review |
| 7 | Placement test; Level A and Level C | Medium to large | Which levels first |
| 8 | Public launch: domain, help page, support | Small | Domain name; launch decision |

## Decisions needed from you

1. Is Stage 1 (backup file) enough for now, or go straight to cloud sync?
2. Which backend: Supabase (recommended), Cloudflare, or Firebase?
3. Where do most families you have in mind live? This decides the hosting region and which privacy law leads.
4. Should handwriting ever leave the device, or stay on it always?
5. For a public version, what should the levels and the method be called, once the Kumon names are gone?
6. Free for everyone, or free for one child with a small fee beyond that?
