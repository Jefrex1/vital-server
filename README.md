# oServer: Web-based SSH Server Manager

A full-stack web application for managing Linux servers over SSH straight from the browser: a terminal, a file manager, system metrics and user management in one place.

![Screenshot](docs/screenshot.png)

## Features

- **SSH terminal in the browser**, powered by WebSockets
- **SFTP file manager** with a built-in text editor, upload and download
- **System metrics**: CPU/GPU temperature, RAM and disk usage
- **Authentication** with JWT and **role-based access control (RBAC)**
- **Audit logging** of user actions
- **AES-256-GCM encryption** for sensitive data
- **Groups and provisioning** system for managing users
- **Internationalization (i18n)**
- **Interactive API docs** with Swagger UI

## Tech Stack

| Layer    | Technologies                                    |
| -------- | ----------------------------------------------- |
| Frontend | Next.js, React, TypeScript, Tailwind CSS        |
| Backend  | Node.js, Express, ssh2, WebSockets              |
| Database | SQLite                                          |
| Auth     | JWT                                             |

## Project Structure

```
├── app/        # Next.js App Router pages and layouts
├── src/        # Frontend components and logic
├── public/     # Static assets
└── backend/    # Express API (SSH, SFTP, auth, database)
```

## Getting Started

### Prerequisites

- Node.js <version>
- A Linux server with SSH access

### Installation

```bash
git clone https://github.com/Jefrex1/vital-server.git
cd vital-server
npm install
```

### Environment variables

Create a `.env` file based on the example below:

```env
# Add your real variable names here
JWT_SECRET=<your-secret>
ENCRYPTION_KEY=<32-byte-key>
```

### Run

```bash
# Backend (default: http://localhost:3001)
cd backend
npm install
npm start

# Frontend (in a second terminal, from the project root)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## API Documentation

Swagger UI is available at `<http://localhost:3001/api-docs>` while the backend is running.

## Requirements on the managed server

- GPU temperature requires `nvidia-smi`
- CPU temperature is read from `/sys/class/thermal/thermal_zone0/temp`

## Security notes

- Always run behind **HTTPS** in production
- Use a strong, unique `JWT_SECRET` and `ENCRYPTION_KEY`, and never commit your `.env` file

## Background

Started as a monolithic SSH file manager and grew into a modular application with security hardening, role-based access and a full API. Built as my bachelor's diploma project.

## Author

**Orest**: [GitHub](https://github.com/Jefrex1)
