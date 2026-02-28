# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**86ed** is a transient social chat app — real-time only, zero persistence. Messages use Redis TTL to auto-expire. If you aren't in the room, you missed it.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS (dark mode, pub-inspired aesthetic)
- **Database/Cache:** Upstash Redis (fire-and-forget messaging, native TTL)
- **Real-time:** Redis Pub/Sub
- **Deployment:** Railway (Next.js + Upstash Redis plugin)

## Commands

Once the project is initialized, standard Next.js commands apply:

```bash
npm run dev       # Start development server
npm run build     # Build for production
npm run start     # Start production server
npm run lint      # Run ESLint
```

## Architecture

### Redis Data Model

- **Pub/Sub channels:** Each room ID maps to a unique Redis channel (`room:{id}`)
- **Message keyspace:** `room:{id}:msg:{uuid}` with `EX` expiry set at write time
- **Presence:** Active socket connections tracked per room

### Key Design Constraints

- **No persistence:** Messages expire via TTL — no database reads for history
- **Presence-gated:** Users only receive messages while actively connected to a room
- **Ephemeral rooms ("Snugs"):** Rooms require no setup or teardown; they live and die with their Pub/Sub subscribers

### Environment Variables

- `REDIS_URL` — Upstash Redis connection string (set in Railway dashboard)

## Deployment

Push to GitHub → Railway auto-deploys. Add Upstash Redis plugin in Railway dashboard and set `REDIS_URL`.
