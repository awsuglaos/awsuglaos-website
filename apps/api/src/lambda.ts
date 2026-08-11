import { handle } from 'hono/aws-lambda';
import app from './app.js';

/**
 * API Gateway (HTTP API) entry point. Hono's adapter accepts the v2 payload
 * format directly, so there is no translation layer to maintain.
 */
export const handler = handle(app);
