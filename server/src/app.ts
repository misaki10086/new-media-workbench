import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { apiRouter } from './routes/index.js';
import { uploadDirectory } from './services/storage.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim()), credentials: false }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use('/uploads', express.static(uploadDirectory()));
app.use('/api', apiRouter);
app.use(notFound);
app.use(errorHandler);
