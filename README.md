# PlacementOS

PlacementOS is a private placement preparation workspace built with Next.js 15, React 19, and MongoDB. It tracks independent topic progress for each company, stores focus sessions, and calculates daily streaks using Asia/Kolkata.

## Requirements

- Node.js 20 or later
- A MongoDB database (MongoDB Atlas works well with Vercel)
- A private workspace password and a random session signing secret

## Environment variables

Copy `.env.example` to `.env.local` and set:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string. Keep this server-side; never prefix it with `NEXT_PUBLIC_`. |
| `MONGODB_DB` | Database name, for example `placement`. |
| `AUTH_PASSWORD` | Password used to sign in to this single-owner workspace. |
| `SESSION_SECRET` | Random secret used to sign the HTTP-only session cookie. Use at least 32 random bytes. |

Generate a session secret with `openssl rand -base64 48` or a password manager. Use distinct values for local and production.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. The first authenticated request seeds the starter topics and creates the required MongoDB indexes automatically. No manual SQL or migration command is needed.

## Deploy to Vercel

1. Push the project to a Git repository and import it in Vercel.
2. Set the four variables above in the Vercel project settings for Preview and Production.
3. In MongoDB Atlas, allow network access from Vercel (or use an appropriate network access configuration for your deployment) and create a database user with access to the selected database.
4. Deploy with the Next.js preset. Vercel detects the framework and runs `npm run build`.

The application creates indexes at runtime and seeds the initial roadmap once per empty workspace. The API is protected by the signed session cookie; database credentials and password checks stay on the server. The app uses one owner workspace rather than multi-user sign-up. Configure HTTPS in production (Vercel does this automatically).

## Data model

MongoDB collections: `topics`, `companies`, `progress`, `sessions`, `timer`, and `settings`. Each document is scoped to the private owner workspace. Progress has a unique owner/topic/company index. Completed sessions preserve their company and topic names so history remains readable if a company is later removed.
