# Tikka Brands Dashboard

A read-only MERN-based dashboard application that aggregates operational data from Square (POS), Homebase (scheduling), and MarketMan (inventory) into a unified view for restaurant owners and their teams.

## Tech Stack

- **Backend**: Node.js 24+, TypeScript, Express, MongoDB, Mongoose
- **Frontend**: React 19+, TypeScript, Vite, Redux Toolkit, Tailwind CSS
- **Authentication**: JWT (access + refresh tokens) with HTTP-only cookies
- **Real-time**: Socket.io (for system notifications)

## Project Structure

```
tikka-brands-dashboard/
├── server/          # Backend Express application
├── client/          # Frontend React application
├── design/          # Design assets and tokens
└── .cursor/         # Development rules
```

## Architecture

- **Backend**: Follows SOLID principles with controllers, services, repositories, routes, configs, and utils
- **Frontend**: Business logic separated from UI components using services and hooks
- **RBAC**: Role-based access control enforced on both frontend and backend
- **Deployment**: Single server serves both API and frontend static files in production

## Getting Started

### Prerequisites

- Node.js 24+ (LTS)
- MongoDB instance
- npm (or yarn/pnpm)

### Installation

1. Clone the repository
2. Install dependencies:

   ```bash
   cd server && npm install
   cd ../client && npm install
   ```

3. Set up environment variables:
   - Copy `server/.env.example` to `server/.env` and configure
   - Copy `client/.env.example` to `client/.env` and configure

4. Start development servers:

   ```bash
   # Terminal 1: Start backend
   cd server && npm run dev

   # Terminal 2: Start frontend
   cd client && npm run dev
   ```

The frontend will proxy API requests to the backend automatically.

### Production Build

1. Build the frontend:

   ```bash
   cd client && npm run build
   ```

2. Start the server (serves both API and frontend):
   ```bash
   cd server && npm start
   ```

## Roles

- Owner (super admin)
- Director of Operations
- District Manager
- General Manager
- Shift Supervisor
- Team Member

## Design System

See `/design/README.md` and `/design/tokens.json` for UI design specifications.

## Development Rules

See `.cursor/rules.md` for detailed development guidelines and constraints.

## License

[Add license information]
