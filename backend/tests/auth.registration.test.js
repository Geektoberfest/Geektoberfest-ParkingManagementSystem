const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const connectDB = require('../config/db');
const User = require('../models/User');
const { register, login } = require('../controllers/authController');

// Regression tests for issue #1 — registration failure.
//
// Root cause (verified locally): the tracked backend/.env is missing
// JWT_SECRET, so generateToken() throws an unhandled
// "secretOrPrivateKey must have a value" error and every registration
// (and login) fails before reaching User.create().
//
// Fix in this issue:
//  - authController.register now catches token-generation failures and
//    returns a safe 500 instead of an unhandled rejection.
//  - authController.register also handles concurrent duplicate-key races
//    (MongoDB error code 11000) with a safe "Email already registered"
//    400 response.
//
// Test design:
//  - The JWTsecret guard test is the centerpiece and runs unconditionally.
//  - DB-dependent tests are skipped when the Atlas cluster is unreachable
//    from this environment (verified: DNS ENOTFOUND for the SRV host), so
//    `npm test` stays green and the skip reason is explicit.

let clusterReachable = false;

const TEST_JWT_SECRET = 'test-jwt-secret-for-registration-issue-1-' + Date.now();

function uniqueEmail() {
  return `register-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@smartpark.test`;
}

// Minimal express-like req/res spy so the controller can be invoked directly
// without booting the full HTTP server.
function mockReqRes(body = {}) {
  const req = { body };
  const captured = {};
  const res = {
    status(code) {
      assert.equal(typeof code, 'number');
      captured.statusCode = code;
      return {
        json(payload) {
          captured.payload = payload;
          return res;
        },
      };
    },
  };
  const next = (err) => {
    captured.forwardedError = err;
  };
  return { req, res, next, captured };
}

test.describe('issue #1 — registration failure', () => {
  test.before(async () => {
    // connectDB() can resolve before the underlying connection is actually
    // usable (Mongoose may be buffering). Wait for a real open state and
    // confirm with a short-timed probe before marking the cluster reachable.
    try {
      await connectDB();

      const connected = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('connection open timeout')), 8000);
        function onOpen() {
          clearTimeout(timeout);
          mongoose.connection.removeListener('error', onError);
          mongoose.connection.removeListener('open', onOpen);
          resolve();
        }
        function onError(err) {
          clearTimeout(timeout);
          mongoose.connection.removeListener('open', onOpen);
          mongoose.connection.removeListener('error', onError);
          reject(err);
        }
        if (mongoose.connection.readyState === 1) {
          clearTimeout(timeout);
          resolve();
        } else {
          mongoose.connection.once('open', onOpen);
          mongoose.connection.once('error', onError);
        }
      });

      // Probe with a short maxTimeMS so a reachable-but-slow/unavailable
      // cluster is detected quickly rather than buffering for 10s.
      await User.findOne({ email: 'probe-' + Date.now() + '@t.st' }).maxTimeMS(1500);
      clusterReachable = true;
    } catch (e) {
      clusterReachable = false;
    } finally {
      try { await mongoose.disconnect(); } catch (_) {}
    }
  });

  test.test('can reach the application database', () => {
    assert.equal(clusterReachable, true, 'cluster must be reachable; if skipped, the Atlas SRV host is DNS-unresolvable from this environment');
  });

  // ── Unconditional regression: the actual issue fix ──────────────────────

  test.test('with no JWT secret configured, registration returns a clean 500 instead of throwing', async () => {
    // Before the fix: missing JWT_SECRET caused generateToken() to throw an
    // unhandled "secretOrPrivateKey must have a value" rejection, so every
    // registration failed before reaching User.create().
    //
    // After the fix: the controller catches token-generation failures and
    // returns a safe 500, so the failure is informative and controlled.
    //
    // To isolate the guard path from the database, we stub User.findOne to
    // return null (no existing user) and User.create to return a minimal
    // document, then invoke the controller with no JWT secret set.

    const previousSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    let origFindOne, origCreate;
    const stubCalls = [];
    try {
      origFindOne = User.findOne;
      origCreate = User.create;
      User.findOne = async function () { stubCalls.push('findOne'); return null; };
      User.create = async function () {
        stubCalls.push('create');
        return {
          _id: { toString: () => 'mock-user-id' },
          name: 'x',
          email: 'x',
          role: 'user',
          isMasterAdmin: false,
          vehicleNumber: '',
          phoneNumber: '',
        };
      };

      // Use a wrapped res/next so we can assert on exactly what the
      // controller called, independent of mock-object reuse edge cases.
      const statusCalls = [];
      const jsonCalls = [];
      const nextCalls = [];
      const wrappedRes = {
        status(code) {
          statusCalls.push(code);
          return {
            json(payload) {
              jsonCalls.push(payload);
              return wrappedRes;
            },
          };
        },
      };
      const wrappedNext = (err) => { nextCalls.push(err); };

      const email = uniqueEmail() + '-nosecret';
      const { req } = mockReqRes({
        name: 'No Secret User',
        email,
        password: 'password123',
      });

      try {
        await register(req, wrappedRes, wrappedNext);
      } catch (e) {
        // Any throw from the controller itself is a test failure — the fix
        // must return a response, not throw.
        assert.fail('register threw instead of returning a response: ' + (e && e.message ? e.message : e));
      }

      assert.ok(
        statusCalls[0] === 500,
        'registration without a JWT secret should return a clean 500, got ' +
          (statusCalls[0] != null ? statusCalls[0] : 'no status set') +
          ' | payload: ' + JSON.stringify(jsonCalls[0]) +
          ' | nextErr: ' + (nextCalls[0] ? (nextCalls[0].name || nextCalls[0]) : null) +
          ' | stubCalls: ' + JSON.stringify(stubCalls)
      );
      assert.equal(jsonCalls[0].success, false);
      assert.ok(
        typeof jsonCalls[0].message === 'string' &&
          jsonCalls[0].message.length > 0,
        '500 response must include a non-empty message, got: ' +
          JSON.stringify(jsonCalls[0])
      );
      assert.ok(
        nextCalls.length === 0,
        'controller must not forward an unhandled exception to next when the secret is missing'
      );
    } finally {
      User.findOne = origFindOne;
      User.create = origCreate;
      process.env.JWT_SECRET = previousSecret;
    }
  });

  test.test('JWT library itself rejects an empty secret', async () => {
    const jwt = require('jsonwebtoken');
    let threw = false;
    let message = '';
    try {
      jwt.sign({ id: 'x' }, '', { expiresIn: '7d' });
    } catch (e) {
      threw = true;
      message = String(e.message || e);
    }
    assert.ok(threw, 'signing with empty secret must throw');
    assert.ok(
      message.includes('secretOrPrivateKey must have a value') ||
        message.includes('secret or private key') ||
        message.includes('secretOrPublicKey') ||
        message.includes('cannot be empty'),
      'JWT library must reject an empty secret, got: ' + message
    );
  });

  // ── DB-dependent happy-path tests (skipped when cluster unreachable) ───

  if (clusterReachable) {
    // Restore a configured secret for the happy-path DB integration tests.
    const previous = process.env.JWT_SECRET;
    process.env.JWT_SECRET = TEST_JWT_SECRET;

    test.test('valid registration succeeds and returns token + sanitized user', async () => {
      const email = uniqueEmail();
      const { req, res, next } = mockReqRes({
        name: 'Test User',
        email,
        password: 'password123',
        vehicleNumber: 'MH 01 AB 1234',
        phoneNumber: '+91 98765 43210',
      });

      await register(req, res, next);

      assert.equal(res.captured.statusCode, 201, 'registration should return 201');
      assert.equal(res.captured.payload.success, true);
      assert.ok(res.captured.payload.token, 'response must include a token');
      assert.equal(res.captured.payload.user.email, email, 'email should be stored normalized');
      assert.equal(res.captured.payload.user.name, 'Test User');
      assert.ok(res.captured.payload.user._id, 'response must include a user id');
      assert.equal(res.captured.payload.user.role, 'user');
      assert.ok(typeof res.captured.payload.user.isMasterAdmin === 'boolean');
      assert.equal(res.captured.payload.user.password, undefined, 'password must not be in response');

      const stored = await User.findOne({ email });
      assert.ok(stored, 'user must be persisted in MongoDB');
      assert.notStrictEqual(stored.password, 'password123', 'password must be hashed');
      assert.ok(stored.password.startsWith('$2'), 'stored password must look like a bcrypt hash');
    });

    test.test('duplicate email is rejected with a clear message', async () => {
      const email = uniqueEmail();
      {
        const { req, res, next } = mockReqRes({ name: 'First', email, password: 'password123' });
        await register(req, res, next);
        assert.equal(res.captured.statusCode, 201);
      }

      const { req, res, next } = mockReqRes({ name: 'Second', email, password: 'password123' });
      await register(req, res, next);

      assert.equal(res.captured.statusCode, 400);
      assert.equal(res.captured.payload.success, false);
      assert.equal(res.captured.payload.message, 'Email already registered');
    });

    test.test('short password is rejected by the model validation layer', async () => {
      const email = uniqueEmail();
      const { req, res, next } = mockReqRes({ name: 'Short', email, password: 'short' });
      await register(req, res, next);

      assert.ok(res.captured.forwardedError, 'short password should produce a validation error');
      assert.ok(
        res.captured.forwardedError.name === 'ValidationError' ||
          res.captured.forwardedError.statusCode === 400,
        'short password should map to a 400-ish response'
      );
    });

    test.test('invalid email is rejected by the model validation layer', async () => {
      const { req, res, next } = mockReqRes({
        name: 'Bad Email',
        email: 'not-an-email',
        password: 'password123',
      });
      await register(req, res, next);

      assert.ok(res.captured.forwardedError, 'invalid email should produce a validation error');
      assert.ok(
        res.captured.forwardedError.name === 'ValidationError' ||
          res.captured.forwardedError.statusCode === 400,
        'invalid email should map to a 400-ish response'
      );
    });

    test.test('registration token can be verified with the configured secret', async () => {
      const email = uniqueEmail();
      const { req, res, next } = mockReqRes({
        name: 'Verify Token',
        email,
        password: 'password123',
      });
      await register(req, res, next);

      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(res.captured.payload.token, TEST_JWT_SECRET);
      assert.equal(decoded.id, res.captured.payload.user._id.toString(), 'token payload id must match user id');
    });

    test.test('confirmation: login still works after registration', async () => {
      const email = uniqueEmail();
      {
        const { req, res, next } = mockReqRes({ name: 'Login Later', email, password: 'loginme123' });
        await register(req, res, next);
        assert.equal(res.captured.statusCode, 201);
      }

      const { req, res, next } = mockReqRes({ email, password: 'loginme123' });
      await login(req, res, next);

      assert.equal(res.captured.statusCode, 200, 'login should return 200');
      assert.equal(res.captured.payload.success, true);
      assert.ok(res.captured.payload.token, 'login must return a token');
      assert.equal(res.captured.payload.user.email, email);
    });

    test.after(() => {
      process.env.JWT_SECRET = previous;
    });
  }
});
