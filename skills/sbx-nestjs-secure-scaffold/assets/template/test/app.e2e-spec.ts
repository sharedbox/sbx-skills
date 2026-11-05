import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './create-test-app';

const METRICS_TOKEN = process.env.METRICS_TOKEN as string;

function signAccessToken(scope: string, options: { audience?: string } = {}): string {
  return new JwtService().sign(
    { scope },
    {
      secret: process.env.JWT_ACCESS_SECRET,
      subject: '7f0c7f2e-0000-4000-8000-000000000001',
      issuer: process.env.JWT_ISSUER,
      audience: options.audience ?? process.env.JWT_AUDIENCE,
      expiresIn: 60,
      algorithm: 'HS256',
    },
  );
}

describe('Application (e2e)', () => {
  let app: NestExpressApplication;
  let http: App;

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('platform hardening', () => {
    it('serves liveness and readiness without auth', async () => {
      await request(http).get('/health/live').expect(200);
      const ready = await request(http).get('/health/ready').expect(200);
      expect(ready.body.status).toBe('ok');
    });

    it('sets security headers and hides the framework', async () => {
      const res = await request(http).get('/health/live');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('answers unknown routes with a JSON 404 that carries the request id', async () => {
      const res = await request(http).get('/api/v1/unknown').set('X-Request-Id', 'trace-12345678').expect(404);
      expect(res.body.requestId).toBe('trace-12345678');
    });

    it('returns generic error bodies without stack traces', async () => {
      const res = await request(http).get('/api/v1/does-not-exist');
      expect(JSON.stringify(res.body)).not.toMatch(/at .*\.(ts|js):\d+/);
    });

    it('rejects oversized payloads', async () => {
      await request(http)
        .post('/api/v1/auth/login')
        .send({ email: 'a@b.co', password: 'x'.repeat(200 * 1024) })
        .expect(413);
    });

    it('requires the metrics token for /metrics', async () => {
      await request(http).get('/metrics').expect(401);
      await request(http).get('/metrics').set('Authorization', 'Bearer wrong').expect(401);
      const res = await request(http).get('/metrics').set('Authorization', `Bearer ${METRICS_TOKEN}`).expect(200);
      expect(res.text).toContain('http_request_duration_seconds');
      expect(res.text).toContain('process_cpu_user_seconds_total');
    });
  });

  describe('token & scope validation', () => {
    // #if db
    const meUrl = '/api/v1/auth/me';
    // #else
    const meUrl = '/api/v1/me';
    // #endif

    it('401 without token, with garbage, with wrong signature or audience', async () => {
      await request(http).get(meUrl).expect(401);
      await request(http).get(meUrl).set('Authorization', 'Bearer not.a.jwt').expect(401);
      const forged = new JwtService().sign(
        { scope: 'profile:read' },
        { secret: 'another-secret-another-secret-123456', subject: 'x', issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE },
      );
      await request(http).get(meUrl).set('Authorization', `Bearer ${forged}`).expect(401);
      const wrongAud = signAccessToken('profile:read', { audience: 'someone-else' });
      await request(http).get(meUrl).set('Authorization', `Bearer ${wrongAud}`).expect(401);
    });

    it('403 when the token lacks the required scope', async () => {
      const res = await request(http)
        .get(meUrl)
        .set('Authorization', `Bearer ${signAccessToken('orders:read')}`)
        .expect(403);
      expect(res.body.code).toBe('INSUFFICIENT_SCOPE');
    });
    // #if !db

    it('200 with a valid token carrying the scope', async () => {
      const res = await request(http)
        .get(meUrl)
        .set('Authorization', `Bearer ${signAccessToken('profile:read orders:read')}`)
        .expect(200);
      expect(res.body.scopes).toEqual(['profile:read', 'orders:read']);
    });
    // #endif
  });
  // #if db

  describe('auth flow', () => {
    const credentials = { email: 'ana@example.com', password: 'a long enough passphrase' };

    it('register -> login -> me -> refresh (rotation) -> reuse detection -> logout', async () => {
      const registered = await request(http)
        .post('/api/v1/auth/register')
        .send({ name: 'Ana', ...credentials })
        .expect(201);
      expect(registered.body).not.toHaveProperty('passwordHash');
      expect(registered.body.scopes).toEqual(['profile:read']);

      await request(http).post('/api/v1/auth/register').send({ name: 'Ana', ...credentials }).expect(409);
      await request(http)
        .post('/api/v1/auth/register')
        .send({ name: 'Ana', email: 'b@example.com', password: 'short', isAdmin: true })
        .expect(400);

      await request(http)
        .post('/api/v1/auth/login')
        .send({ email: credentials.email, password: 'wrong password' })
        .expect(401);
      const unknown = await request(http)
        .post('/api/v1/auth/login')
        .send({ email: 'ghost@example.com', password: 'whatever' })
        .expect(401);
      expect(unknown.body.code).toBe('INVALID_CREDENTIALS');

      const login = await request(http).post('/api/v1/auth/login').send(credentials).expect(200);
      expect(login.body.tokenType).toBe('Bearer');

      const me = await request(http)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200);
      expect(me.body.email).toBe(credentials.email);

      const refreshed = await request(http)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: login.body.refreshToken })
        .expect(200);
      expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);

      // replaying the rotated token revokes the whole family, including the newest token
      await request(http).post('/api/v1/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(401);
      await request(http).post('/api/v1/auth/refresh').send({ refreshToken: refreshed.body.refreshToken }).expect(401);

      const second = await request(http).post('/api/v1/auth/login').send(credentials).expect(200);
      await request(http).post('/api/v1/auth/logout').send({ refreshToken: second.body.refreshToken }).expect(204);
      await request(http).post('/api/v1/auth/refresh').send({ refreshToken: second.body.refreshToken }).expect(401);
    });
  });
  // #endif
});
