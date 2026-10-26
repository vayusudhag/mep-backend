# 🐂 Mana Edla Pandalu — Backend API

**Mana Edla Pandalu (MEP)** is a full-stack platform for traditional Telugu bull racing in Andhra Pradesh and Telangana.

This repository contains the backend REST API supporting teams, bulls, drivers, racing events, registrations, rankings, and performance statistics.

> Track teams, bulls, events and live updates in one place.

## 🌐 Project Links

- **Live Website:** https://manaedlapandalu.com
- **Frontend:** https://github.com/vayusudhag/mep-frontend
- **Backend:** https://github.com/vayusudhag/mep-backend

## ✨ Features

- User authentication and authorization
- Racing team and bull management
- Driver profiles
- Racing events and registrations
- Event-day management and results
- Leaderboards and performance statistics
- Administrative management
- Dashboard APIs
- Authentication audit logging
- Scheduled maintenance jobs

## 🛠️ Technology Stack

| Category | Technologies |
|---|---|
| Runtime | Node.js |
| Framework | Express 5 |
| Database | MongoDB, Mongoose |
| Authentication | JWT, bcryptjs |
| Security | Helmet, CORS, rate limiting |
| File Storage | AWS S3 SDK, Multer |
| Scheduling | node-cron |
| Integrations | Twilio SDK |

## 🏗️ Architecture

```text
React Frontend
      |
      v
Express REST API
      |
      v
Authentication & Middleware
      |
      v
Routes → Controllers → Services
      |
      v
Mongoose Models
      |
      v
MongoDB

External integrations: AWS S3, Twilio
```

## 🔌 API Routes

| Route Prefix | Purpose |
|---|---|
| `/api/auth` | Authentication |
| `/api/events` | Events and registrations |
| `/api/teams` | Team management |
| `/api/admin/registrations` | Administrative registrations |
| `/api/admin` | Administrative management |
| `/api/performance` | Performance statistics |
| `/api/event-days` | Event-day management |
| `/api/event-day-entries` | Event-day entries |
| `/api/leaderboard` | Rankings |
| `/api/dashboard` | Dashboard data |
| `/api/bulls` | Bull information |
| `/api/bulls/profile` | Bull profiles |
| `/api/drivers` | Driver information |
| `/health` | Health check |

## 📁 Project Structure

```text
mep-backend/
├── config/
├── controllers/
├── docs/
├── jobs/
├── middleware/
├── models/
├── routes/
├── scripts/
├── services/
├── utils/
├── app.js
├── server.js
└── package.json
```

## 🔐 Security

The backend includes JWT authentication, password hashing, security headers, rate limiting, CORS configuration, and centralized error handling.

## 🚀 Local Development

### Prerequisites

- Node.js and npm
- MongoDB
- Required environment variables

### Installation

```bash
git clone https://github.com/vayusudhag/mep-backend.git
cd mep-backend
npm install
```

Configure the required environment variables securely. Never commit passwords, database credentials, or API keys.

### Development

```bash
npm run dev
```

### Production Start

```bash
npm run serve
```

## 📚 Documentation

See `docs/admin-management-api.md` for additional administrative API documentation.

## 🎯 Project Vision

Mana Edla Pandalu aims to create a centralized digital home for traditional Telugu bull racing, making racing information accessible to participants, organizers, and enthusiasts.

---

**Connecting Traditional Sports with Modern Technology.**
