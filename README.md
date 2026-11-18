# Charlustor — Backend

REST API for **Charlustor**, a tournament platform for the *Yu-Gi-Oh! Master Duel* community. Organizers create and run tournaments; players register, submit their decks and report match results; the API handles pairings, standings and season rankings.

Built with **NestJS, TypeScript, Prisma and PostgreSQL**. Front end: [charlustor-frontend](https://github.com/mateusbra/charlustor-frontend).

## Features

- **Authentication:** email/password with JWT access tokens and refresh tokens in an httpOnly cookie, Google and Discord OAuth, and password reset by email.
- **Roles:** `PLAYER`, `ORGANIZER` and `ADMIN`, enforced with guards and decorators.
- **Tournaments:** Swiss, single elimination, double elimination, and Swiss with top cut. Lifecycle goes from draft → registration open/closed → in progress → completed.
- **Pairing engine:** Swiss pairing and bracket pairing for the top cut.
- **Matches:** players report scores; organizers resolve disputed results.
- **Standings and seasons:** live tournament standings and a season ranking across tournaments.
- **AI deck recognition:** players upload screenshots of their deck. A vision model (Anthropic API) reads the card names and quantities, which are then checked against the YGOPRODeck card database before an organizer approves or rejects the deck.
- **Extras:** organizer dashboard, admin user and season management, and the latest YouTube videos for the home page.

## Tech stack

| Area | Tools |
|---|---|
| Framework | NestJS, TypeScript (ES modules) |
| Database | PostgreSQL, Prisma ORM (migrations) |
| Auth | Passport (JWT, Google, Discord), bcrypt |
| AI | Anthropic API (vision) for deck recognition |
| Testing | Vitest (unit and e2e) |
| Tooling | oxlint, Prettier, Docker |

## Project structure

```text
src/
├── auth/               # register, login, refresh, OAuth, password reset, guards
├── users/              # profile
├── admin/              # user roles, seasons
├── tournaments/        # CRUD and registration window
├── registrations/      # join/withdraw, participant list
├── tournament-engine/  # start, advance round, top cut, complete
├── pairing/            # Swiss and bracket pairing
├── matches/            # score reports and dispute resolution
├── standings/          # tournament standings
├── seasons/            # season ranking
├── decks/              # deck upload, AI recognition, card lookup
├── organizers/         # organizer dashboard
├── youtube/            # latest channel videos
├── mail/               # email delivery
└── health/             # health check
prisma/                 # schema and migrations
```

## Running locally

Requirements: Node.js 20+ and a PostgreSQL database.

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL and the JWT secrets
npx prisma migrate dev
npm run start:dev         # http://localhost:3000
```

OAuth, email, AI deck recognition and YouTube are optional. Without their environment variables, the related feature is disabled and the rest of the API keeps working.

## Tests

```bash
npm test           # unit tests
npm run test:e2e   # end-to-end tests
npm run test:cov   # coverage
```
