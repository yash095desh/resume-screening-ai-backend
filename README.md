# Resume Screening AI Backend

An AI-powered recruitment platform backend that automates candidate screening and talent sourcing. Built with Node.js, Express, TypeScript, and integrated with OpenAI for intelligent resume parsing and candidate matching.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Running the Project](#running-the-project)
- [API Documentation](#api-documentation)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [LinkedIn Sourcing Workflow](#linkedin-sourcing-workflow)
- [Contributing](#contributing)

## Features

### 1. Resume Screening (Regular Job Postings)
- Create job postings with titles and descriptions
- Upload candidate resumes (PDF, Word, Text files)
- AI-powered extraction of:
  - Personal information (name, email, phone)
  - Skills and competencies
  - Work experience
  - Educational background
  - Total years of experience
- Intelligent candidate scoring against job requirements
- Generate AI summaries with strengths and weaknesses
- Processing status tracking with detailed logs

### 2. LinkedIn Talent Sourcing
- Automated LinkedIn profile discovery based on job requirements
- 8-stage LangGraph workflow with fault tolerance:
  1. Format job description
  2. Generate search queries
  3. Search LinkedIn profiles
  4. Enrich contact information
  5. Scrape full profiles
  6. Parse profile data with AI
  7. Save to database
  8. Score and rank candidates
- Real-time progress tracking via Server-Sent Events (SSE)
- Rate limit handling with automatic retry
- Deduplication across sourcing jobs

### 3. Advanced Candidate Analysis
- **Interview Readiness Assessment**: READY_TO_INTERVIEW, INTERVIEW_WITH_VALIDATION, NOT_RECOMMENDED
- **Skill Gap Analysis**: Critical gaps, proficiency levels, impact assessment
- **Experience Analysis**: Relevance scoring, seniority alignment, industry fit
- **Interview Focus Areas**: Suggested questions, red flags, focus areas

## Tech Stack

| Category | Technologies |
|----------|-------------|
| **Runtime** | Node.js, Express.js v5, TypeScript 5.9 |
| **Database** | PostgreSQL with Prisma ORM v6 |
| **AI/LLM** | OpenAI GPT-4O-Mini, Vercel AI SDK, LangGraph |
| **Authentication** | Clerk SDK |
| **File Storage** | Supabase, Cloudinary |
| **Document Parsing** | Mammoth (Word), Unstructured Client (PDF) |
| **Web Scraping** | Apify Client (LinkedIn) |
| **Security** | Helmet, CORS |
| **Validation** | Zod |

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** v18.0.0 or higher
- **npm** v9.0.0 or higher
- **PostgreSQL** v14.0 or higher
- **Git**

You'll also need accounts for:
- [Clerk](https://clerk.com) - Authentication
- [OpenAI](https://platform.openai.com) - AI processing
- [Supabase](https://supabase.com) - File storage
- [Apify](https://apify.com) - LinkedIn scraping (for sourcing feature)
- [Cloudinary](https://cloudinary.com) - Image storage (optional)

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yash095desh/resume-screening-ai-backend.git
   cd resume-screening-ai-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Generate Prisma client**
   ```bash
   npm run prisma:generate
   ```

5. **Run database migrations**
   ```bash
   npm run prisma:migrate
   ```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=8000
NODE_ENV=development

# Database
DATABASE_URL="postgresql://username:password@localhost:5432/resume_screening?schema=public"

# Clerk Authentication
CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx

# OpenAI
OPENAI_API_KEY=sk-xxxxx

# Supabase (File Storage)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxxxx
SUPABASE_BUCKET_NAME=resumes

# Cloudinary (Optional - Image Storage)
CLOUDINARY_CLOUD_NAME=xxxxx
CLOUDINARY_API_KEY=xxxxx
CLOUDINARY_API_SECRET=xxxxx

# Apify (LinkedIn Scraping)
APIFY_API_TOKEN=xxxxx

# Unstructured (Document Parsing - Optional)
UNSTRUCTURED_API_KEY=xxxxx
```

## Database Setup

### Using PostgreSQL locally

1. **Create a database**
   ```bash
   createdb resume_screening
   ```

2. **Run migrations**
   ```bash
   npm run prisma:migrate
   ```

3. **View database with Prisma Studio** (optional)
   ```bash
   npm run prisma:studio
   ```

### Using a cloud database

Update the `DATABASE_URL` in your `.env` file with your cloud PostgreSQL connection string (e.g., from Supabase, Railway, or Neon).

## Running the Project

### Development

```bash
npm run dev
```

This starts the server with hot-reload at `http://localhost:8000`

### Production

```bash
# Build TypeScript
npm run build

# Start production server
npm start
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot-reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run production server |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Run database migrations |
| `npm run prisma:studio` | Open Prisma Studio GUI |

## API Documentation

### Health Check

```
GET /health
```

Returns server status.

---

### Jobs (Regular Posting)

#### Create a Job
```
POST /api/jobs
Content-Type: multipart/form-data
Authorization: Bearer <clerk_token>

Body:
- title: string (required)
- description: string
- jdFile: File (optional - job description file)
- resumes: File[] (optional - candidate resumes)
```

#### List Jobs
```
GET /api/jobs
Authorization: Bearer <clerk_token>
```

#### Get Job Details
```
GET /api/jobs/:jobId
Authorization: Bearer <clerk_token>
```

#### Update Job
```
PUT /api/jobs/:jobId
Authorization: Bearer <clerk_token>
```

#### Delete Job
```
DELETE /api/jobs/:jobId
Authorization: Bearer <clerk_token>
```

#### Process Pending Resumes
```
POST /api/jobs/process/:jobId
Authorization: Bearer <clerk_token>
```

---

### Sourcing (LinkedIn)

#### Create Sourcing Job
```
POST /api/sourcing
Content-Type: application/json
Authorization: Bearer <clerk_token>

Body:
{
  "title": "Senior Frontend Developer",
  "rawJobDescription": "We are looking for...",
  "maxCandidates": 50
}
```

#### List Sourcing Jobs
```
GET /api/sourcing
Authorization: Bearer <clerk_token>
```

#### Get Sourcing Job Details
```
GET /api/sourcing/:jobId
Authorization: Bearer <clerk_token>
```

#### Stream Progress (SSE)
```
GET /api/sourcing/stream/:jobId
Authorization: Bearer <clerk_token>
```

Returns Server-Sent Events for real-time progress updates.

#### Retry Failed Job
```
POST /api/sourcing/retry
Content-Type: application/json
Authorization: Bearer <clerk_token>

Body:
{
  "jobId": "sourcing_job_id"
}
```

---

### Candidates

#### Get Candidate Details
```
GET /api/candidates/:candidateId
Authorization: Bearer <clerk_token>
```

---

### Cron

#### Trigger Scheduled Tasks
```
GET /api/cron
```

## Project Structure

```
resume-screening-ai-backend/
├── src/
│   ├── server.ts                 # Express server setup
│   ├── middleware/
│   │   ├── auth.ts               # Clerk authentication
│   │   └── errorHandler.ts       # Global error handling
│   ├── routes/
│   │   ├── job.ts                # Create/list jobs
│   │   ├── jobById.ts            # Get/update/delete job
│   │   ├── candidates.ts         # Candidate details
│   │   ├── process.ts            # Resume processing
│   │   ├── sourcing.ts           # LinkedIn sourcing
│   │   ├── sourcingById.ts       # Sourcing job details
│   │   ├── stream.ts             # SSE progress streaming
│   │   ├── retry.ts              # Retry failed jobs
│   │   └── cron.ts               # Scheduled tasks
│   └── lib/
│       ├── ai/
│       │   ├── parser.ts         # Resume/JD extraction
│       │   ├── scorer.ts         # Candidate summaries
│       │   ├── matcher.ts        # Match score calculation
│       │   ├── linkedin-scorer.ts # LinkedIn candidate scoring
│       │   ├── profile-parser.ts # Profile data extraction
│       │   └── job-description-formator.ts
│       ├── sourcing/
│       │   ├── workflow.ts       # LangGraph workflow
│       │   ├── state.ts          # Workflow state
│       │   └── nodes/            # Workflow stages
│       │       ├── format-jd.ts
│       │       ├── generate-queries.ts
│       │       ├── search-profiles.ts
│       │       ├── enrich-and-create.ts
│       │       ├── scrape-candidates.ts
│       │       ├── parse-candidates.ts
│       │       ├── updates-candidate.ts
│       │       └── score-batch.ts
│       ├── processing/
│       │   └── pipeline-processor-v2.ts
│       ├── scrapping/
│       │   ├── apify-client.ts
│       │   └── profile-cleaner.ts
│       ├── storage/
│       │   ├── supabase.ts
│       │   └── cloudinary.ts
│       ├── utils/
│       │   ├── file-parser.ts
│       │   └── deduplication.ts
│       ├── validations/
│       │   └── sourcing.ts
│       ├── constants/
│       │   └── linkedin-mappings.ts
│       ├── errors/
│       │   └── rate-limit-error.ts
│       └── prisma.ts
├── prisma/
│   ├── schema.prisma             # Database schema
│   └── migrations/               # Migration files
├── dist/                         # Compiled JavaScript
├── .env                          # Environment variables
├── package.json
├── tsconfig.json
└── nodemon.json
```

## Database Schema

### Core Models

#### User
Authenticated users via Clerk.

#### Job
Regular job postings with candidates.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| userId | String | Owner reference |
| title | String | Job title |
| description | String | Job description |
| requiredSkills | String[] | Required skills |
| totalCandidates | Int | Candidate count |

#### Candidate
Uploaded resume candidates.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| jobId | String | Job reference |
| name | String | Candidate name |
| email | String | Contact email |
| matchScore | Int | AI match score (0-100) |
| matchedSkills | String[] | Skills that match |
| missingSkills | String[] | Skills not found |
| summary | String | AI-generated summary |
| strengths | String[] | Key strengths |
| weaknesses | String[] | Areas of concern |

#### SourcingJob
LinkedIn sourcing projects.

| Field | Type | Description |
|-------|------|-------------|
| id | CUID | Primary key |
| status | Enum | Current workflow stage |
| totalProfilesFound | Int | Profiles discovered |
| profilesScraped | Int | Profiles scraped |
| profilesParsed | Int | Profiles parsed |
| profilesScored | Int | Profiles scored |

#### LinkedInCandidate
Discovered LinkedIn profiles with detailed scoring.

| Field | Type | Description |
|-------|------|-------------|
| matchScore | Float | Total score (0-100) |
| skillsScore | Float | Skills match (0-30) |
| experienceScore | Float | Experience fit (0-25) |
| industryScore | Float | Industry relevance (0-20) |
| titleScore | Float | Title/seniority fit (0-15) |
| interviewReadiness | Enum | Hiring recommendation |

### Status Enums

**SourcingJobStatus**
```
CREATED → FORMATTING_JD → JD_FORMATTED → SEARCHING_PROFILES →
PROFILES_FOUND → SCRAPING_PROFILES → PARSING_PROFILES →
SAVING_PROFILES → SCORING_PROFILES → COMPLETED
```

**InterviewReadinessStatus**
```
NOT_ASSESSED | READY_TO_INTERVIEW | INTERVIEW_WITH_VALIDATION | NOT_RECOMMENDED
```

## LinkedIn Sourcing Workflow

The LinkedIn sourcing feature uses LangGraph for orchestration with PostgreSQL checkpointing for fault tolerance.

```
┌─────────────────┐
│  1. Format JD   │ Extract structured requirements
└────────┬────────┘
         │
┌────────▼────────┐
│ 2. Gen Queries  │ Create LinkedIn search filters
└────────┬────────┘
         │
┌────────▼────────┐
│ 3. Search       │ Find profiles via Apify
└────────┬────────┘
         │
┌────────▼────────┐
│ 4. Enrich       │ Get contact info (email)
└────────┬────────┘
         │
┌────────▼────────┐
│ 5. Scrape       │ Full profile scraping
└────────┬────────┘
         │
┌────────▼────────┐
│ 6. Parse        │ AI extraction from raw data
└────────┬────────┘
         │
┌────────▼────────┐
│ 7. Save         │ Persist to database
└────────┬────────┘
         │
┌────────▼────────┐
│ 8. Score        │ Calculate match scores
└────────┴────────┘
```

### Scoring Breakdown (100 points)

| Category | Points | Description |
|----------|--------|-------------|
| Skills Match | 0-30 | Required skills coverage |
| Experience Level | 0-25 | Years of relevant experience |
| Industry Relevance | 0-20 | Industry background fit |
| Title/Seniority | 0-15 | Role level alignment |
| Nice-to-Have | 0-10 | Bonus/preferred skills |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request


---

Built by [Yash Desh](https://github.com/yash095desh)
