# 86ed

**"If you aren't in the room, you missed it."**

86ed is a transient social chat app designed to mimic the ephemeral nature of a real conversation among friends at a bar. No history, no archives, no logs. When the conversation is over, it’s 86ed.

## 🍺 The Concept
In the service industry, to "86" something means it’s out of stock or removed from the menu. This app applies that logic to digital communication:
- **Real-time Only:** You must be active in a "Snug" (room) to see messages.
- **Auto-Cleanup:** Messages utilize Redis TTL (Time To Live) to vanish shortly after they are sent.
- **Zero Persistence:** Once a message expires or you leave the room, it's gone for good.

## 🛠 Tech Stack
This project is built using **Vibe Coding** via **Claude Code**, prioritizing speed and real-time performance.

*   **Framework:** [Next.js](https://nextjs.org) (App Router)
*   **Styling:** [Tailwind CSS](https://tailwindcss.com) (Dark mode, pub-inspired aesthetic)
*   **Database/Cache:** [Upstash Redis](https://upstash.com)
    *   *Why:* Perfect for "Fire-and-Forget" messaging and native TTL support.
*   **Real-time:** Redis Pub/Sub for instant message broadcasting.
*   **Deployment:** [GitHub](https://github.com) + [Railway](https://railway.app)
    *   *Why:* Railway provides seamless Redis + Next.js orchestration.

## 🏗 Architecture (The Redis "Snug" Logic)
To support multiple rooms without a relational database, we use:
- **Channels:** Each room ID is a unique Redis Pub/Sub channel.
- **Keyspace:** `room:{id}:msg:{uuid}` with a set `EX` (expiry) time.
- **Presence:** Tracking active socket connections to show who is currently "at the bar."

## 🚀 Deployment
This app is designed to be deployed on [Railway](https://railway.appnew).
1. Push code to GitHub.
2. Connect GitHub repo to Railway.
3. Add the [Upstash Redis Plugin](https://railway.apptemplate/redis) in the Railway dashboard.
4. Set `REDIS_URL` in environment variables.

---
*Created with 🥃 by gbmetzner*
