import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, extractErrorMessage } from '../api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('extractErrorMessage', () => {
  it('keeps string detail as-is (readable 401s)', () => {
    expect(extractErrorMessage(401, { detail: 'Invalid credentials' })).toBe(
      'Invalid credentials',
    );
  });

  it('formats FastAPI 422 validation arrays without [object Object]', () => {
    const body = {
      detail: [
        {
          type: 'missing',
          loc: ['body', 'username'],
          msg: 'Field required',
          input: 'hunter2',
        },
        {
          type: 'missing',
          loc: ['body', 'password'],
          msg: 'Field required',
          input: 'hunter2',
        },
      ],
    };
    const message = extractErrorMessage(422, body);
    expect(message).toBe(
      'username: Field required; password: Field required',
    );
    expect(message).not.toContain('[object Object]');
    expect(message).not.toContain('hunter2');
  });

  it('formats a bare validation-item array body', () => {
    const message = extractErrorMessage(422, [
      { loc: ['query', 'limit'], msg: 'Input should be a valid integer' },
    ]);
    expect(message).toBe('limit: Input should be a valid integer');
    expect(message).not.toContain('[object Object]');
  });

  it('reads structured object detail', () => {
    expect(
      extractErrorMessage(500, { detail: { message: 'Pool has no challenges' } }),
    ).toBe('Pool has no challenges');
  });

  it('falls back to the status for non-JSON/HTML bodies', () => {
    expect(extractErrorMessage(502, undefined)).toBe('Request failed (502)');
    expect(extractErrorMessage(502, '<html>Bad Gateway</html>')).toBe(
      'Request failed (502)',
    );
  });

  it('falls back for unparseable shapes without leaking them', () => {
    expect(extractErrorMessage(500, { detail: { nothing: 'usable' } })).toBe(
      'Request failed (500)',
    );
    expect(extractErrorMessage(500, 42)).toBe('Request failed (500)');
  });

  it('caps very long validation walls', () => {
    const detail = Array.from({ length: 50 }, (_, i) => ({
      loc: ['body', `field_${i}`],
      msg: `Problem number ${i} with a fairly long message`,
    }));
    const message = extractErrorMessage(422, { detail });
    expect(message.length).toBeLessThanOrEqual(240);
  });
});

describe('api error propagation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('staffLogin surfaces readable messages for 422 validation arrays', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            detail: [
              { type: 'missing', loc: ['body', 'username'], msg: 'Field required' },
            ],
          },
          422,
        ),
      ),
    );
    try {
      await api.staffLogin('', '');
      expect.unreachable('staffLogin should throw');
    } catch (e) {
      const err = e as Error & { statusCode?: number };
      expect(err.message).toBe('username: Field required');
      expect(err.message).not.toContain('[object Object]');
      expect(err.statusCode).toBe(422);
    }
  });

  it('staffLogin keeps readable 401 detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ detail: 'Invalid credentials' }, 401)),
    );
    try {
      await api.staffLogin('admin', 'wrong');
      expect.unreachable('staffLogin should throw');
    } catch (e) {
      const err = e as Error & { statusCode?: number };
      expect(err.message).toBe('Invalid credentials');
      expect(err.statusCode).toBe(401);
    }
  });

  it('non-JSON gateway errors never surface raw HTML', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<html><body>502 Bad Gateway</body></html>', {
            status: 502,
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    );
    try {
      await api.adminLogin('admin', 'secret');
      expect.unreachable('adminLogin should throw');
    } catch (e) {
      const err = e as Error;
      expect(err.message).toBe('Request failed (502)');
      expect(err.message).not.toContain('html');
    }
  });
});
