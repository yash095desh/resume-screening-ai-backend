import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';

dotenv.config();

import { errorHandler, notFound } from './middleware/errorHandler';

// Import all routes
import jobsRouter from './routes/job';
import jobByIdRouter from './routes/jobById';
import sourcingRouter from './routes/sourcing';
import sourcingByIdRouter from './routes/sourcingById';
import candidatesRouter from './routes/candidates';
import cronRouter from './routes/cron';
import streamRouter from './routes/stream';
import retryRouter from './routes/retry';
import processRouter from './routes/process';

const app: Application = express();
const PORT = process.env.PORT || 8000;

// ============================
// MIDDLEWARE
// ============================

// Security
app.use(helmet());

// CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:3000',
  'http://localhost:5173',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

// Compression
app.use(compression());

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================
// ROUTES
// ============================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});


// API Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Recruitment Platform API',
    version: '1.0.0',
    endpoints: {
      jobs: '/api/jobs',
      sourcing: '/api/sourcing',
      candidates: '/api/candidates',
      upload: '/api/upload',
      export: '/api/export',
      process: '/api/process/:jobId',
      stream: '/api/stream/:jobId',
      retry: '/api/retry',
      webhooks: '/api/webhooks',
      cron: '/api/cron',
      health: '/health',
    },
  });
});

// API Routes
app.use('/api/jobs/:jobId', jobByIdRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/jobs/process', processRouter);
app.use('/api/candidates', candidatesRouter);

app.use('/api/sourcing/:jobId', sourcingByIdRouter);
app.use('/api/sourcing', sourcingRouter);
app.use('/api/sourcing/stream', streamRouter);
app.use('/api/sourcing/retry', retryRouter);
app.use('/api/cron', cronRouter);


// ============================
// ERROR HANDLING
// ============================

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

// ============================
// START SERVER
// ============================

const server = app.listen(PORT, () => {
  console.log(`
🚀 Server is running!
📡 Port: ${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
🔗 Base URL: http://localhost:${PORT}
📚 API Docs: http://localhost:${PORT}/
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;