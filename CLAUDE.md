# Project Overview

This project is a a app for the finance of restaurant owner's to have control in their numbers and to have the possibility analyse and imporve their revenue and profit also margins.

# Tech Stack

- Framework: Next.js 14 (App Router)
- Language: TypeScript
- Database: PostgreSQL hosted on Supabase
- ORM: Prisma (connects to Supabase DB via connection string)
- Styling: Tailwind CSS
- Auth: Supabase Auth
- Deployment: Railway (via GitHub auto-deploy)

# Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

# Code Rules

- Always use functional components, never class components
- Use TypeScript types/interfaces, avoid `any`
- All DB queries go through Prisma ORM only
- Use server components by default, client components only when needed
- Follow existing file/folder naming conventions

# Folder Structure

- /app → Next.js pages and layouts
- /components → Reusable UI components
- /lib → Utilities and helpers
- /prisma → Schema and migrations

# Infrastructure

- Supabase → Everything data: PostgreSQL DB, Auth, Storage, Realtime
- Railway → Only hosts the Next.js app, connected to GitHub
- GitHub → Push to main triggers auto-deploy on Railway

# Deployment Notes

- Railway connected to GitHub repo (auto-deploy on push to main)
- Environment variables set in Railway dashboard (not .env.local in prod)
- Run `prisma migrate deploy` on Railway at deploy time (never `migrate dev`)
- Prisma connects to Supabase DB via DATABASE_URL (use Supabase pooled connection string)

# Environment Variables

- Local dev: .env.local (never commit)
- Production: set directly in Railway dashboard
- NEXT_PUBLIC_SUPABASE_URL → Supabase project URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY → Supabase anon key
- DATABASE_URL → Supabase pooled connection string (for Prisma)
- DIRECT_URL → Supabase direct connection string (for Prisma migrations)
