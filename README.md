# PSM TouchCTF

**Capture. Crack. Defend.** — A 3-minute touchscreen cybersecurity challenge game.

Players solve phishing, log analysis, and decode challenges, capture a final flag, spin a prize wheel for physical rewards, and climb the live leaderboard. Built for university cybersecurity awareness events.

## Features

- **3 Challenge Types** — Phishing detection, log analysis, and flag decoding
- **Timed Gameplay** — 3-minute rounds with extended-time accessibility mode
- **Prize Wheel** — Qualified players spin for physical prizes with inventory tracking
- **Live Leaderboard** — Real-time rankings with podium celebration
- **Admin Panel** — Full event management: challenges, prizes, staff, audit logs
- **Staff Portal** — Claim redemption with code verification
- **Kiosk-Ready** — Chrome kiosk mode and Fully Kiosk Browser support
- **Sound & Motion** — Immersive audio and animations (toggleable)
- **Responsive** — Works on 390px mobile through 1920px desktop

## Architecture

```
Touchscreen → nginx edge → FastAPI (Python) → PostgreSQL/SQLite
                                       ↓
                          React SPA (Vite, TypeScript)
```

## Quick Start

**Requirements:** Ubuntu 24.04 LTS, 4 CPU cores, 4 GB RAM, 40 GB SSD

```bash
git clone https://github.com/mitayag/psmtouchctf.git
cd psmtouchctf
sudo bash install.sh
```

See [INSTALL.md](INSTALL.md) for detailed installation instructions.

## Documentation

| Document | Description |
|----------|-------------|
| [INSTALL.md](INSTALL.md) | Installation and operations guide |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production deployment details |
| [outputs/DESIGN_SPEC.md](outputs/DESIGN_SPEC.md) | Design specification |
| [outputs/PRODUCT_REQUIREMENTS.md](outputs/PRODUCT_REQUIREMENTS.md) | Product requirements |

## Development

```bash
# Start dev servers (API :8000, UI :5173)
make dev

# Run tests
make test

# Build frontend
make build
```

## URLs

| Route | Description |
|-------|-------------|
| `/` | Player home screen |
| `/play/*` | Game flow (register → challenges → flag → results → prize wheel) |
| `/leaderboard` | Public leaderboard |
| `/admin` | Admin panel (staff login) |
| `/staff` | Staff claim portal |

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, React Router
- **Backend:** Python 3.14, FastAPI, SQLAlchemy, Alembic
- **Database:** PostgreSQL 17 (production) / SQLite (development)
- **Infrastructure:** Docker, nginx, Docker Compose

## License

Third-party assets:
- Sound effects: [Kenney](https://kenney.nl/) (CC0 1.0 Universal)
- Fonts: JetBrains Mono, Inter, Rajdhani (SIL Open Font License)
