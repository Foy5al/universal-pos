import request from 'supertest';
import { describe, expect, it } from 'vitest';

import deployment from '../api/index';

describe('Vercel service entrypoint', () => {
  it('serves health under the public /api prefix', async () => {
    const response = await request(deployment).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ status: 'ok' });
  });

  it('maps /api/v1/* onto the versioned routes', async () => {
    const response = await request(deployment).get('/api/v1/stores');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBeDefined();
  });

  it('keeps query strings intact while stripping the prefix', async () => {
    const response = await request(deployment).get('/api/v1/catalog/products?limit=5');
    expect(response.status).toBe(401);
  });

  it('keeps JSON body parsing for public POST routes', async () => {
    const response = await request(deployment)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });
    expect(response.status).toBe(401);
  });

  it('still accepts unprefixed paths used by local and Docker entrypoints', async () => {
    const response = await request(deployment).get('/v1/stores');
    expect(response.status).toBe(401);
  });

  it('returns the JSON error envelope for unknown paths', async () => {
    const response = await request(deployment).get('/api/not-a-route');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');
  });
});
