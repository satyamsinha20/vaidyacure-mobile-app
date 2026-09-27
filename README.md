# VaidyaCure — Ayurvedic & Holistic Health Platform

Welcome to **VaidyaCure**, a modern Ayurvedic and holistic health platform featuring an enterprise operations administration portal and a high-performance REST API backend.

---

## 📁 Repository Structure

```
Minor_project/
├── admin-panel/        # Next.js 16 (App Router) Admin & Operations Portal
│   ├── src/            # Components, Views, Services, Types
│   ├── .env.example    # Environment variable templates
│   └── package.json    # Next.js, TailwindCSS, Lucide React
│
├── backend/            # Node.js + Express + TypeScript Backend API
│   ├── src/            # Controllers, Models, Routes, Middleware
│   ├── .env.example    # Environment variable templates
│   └── package.json    # Express, Mongoose, JWT, TypeScript
│
└── .gitignore          # Environment & build safety exclusions
```

---

## 🚀 Quick Start Guide

### 1. Backend Setup
```bash
cd backend
npm install
cp .env.example .env     # Configure MongoDB URI, JWT Secret, Port
npm run dev              # Runs on http://localhost:5000
```

### 2. Admin Panel Setup
```bash
cd admin-panel
npm install
cp .env.example .env     # Configure API URL & Cloudinary credentials
npm run dev              # Runs on http://localhost:3003
```

---

## 🔒 Security & Environment
- All `.env` and `.env.local` files containing secret credentials, MongoDB connection strings, JWT keys, and Cloudinary API secrets are strictly ignored by `.gitignore`.
- Refer to `.env.example` in each directory to configure your local or production environment.
