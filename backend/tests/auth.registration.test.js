const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const User = require('../models/User');
const { register, login } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { validateRuntimeConfiguration } = require('../config/auth');
const { registerValidation, validate } = require('../middleware/validate');

const TEST_JWT_SECRET = 'issue-1-test-secret';

function createRequest(body = {}) {
  return { body };
}

function createResponse() {
  const captured = {};
  const response = {
    status(code) {
      captured.status = code;
      return response;
    },
    json(payload) {
      captured.payload = payload;
      return response;
    },
  };
  return { response, captured };
}

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]])
  );

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  return Promise.resolve(callback()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

async function runRegistrationValidation(body) {
  const request = createRequest(body);
  const { response, captured } = createResponse();
  let continued = false;

  for (const validator of registerValidation) {
    await validator.run(request);
  }
  validate(request, response, () => {
    continued = true;
  });

  return { continued, captured };
}

test.describe('Issue #1 registration and login', () => {
  test('startup validation rejects a missing JWT secret without exposing a value', async () => {
    await withEnvironment(
      { MONGODB_URI: 'mongodb://example.invalid/smartpark', JWT_SECRET: undefined },
      () => {
        assert.throws(
          () => validateRuntimeConfiguration(),
          (error) => error.code === 'CONFIGURATION_ERROR' && error.message.includes('JWT_SECRET')
        );
      }
    );
  });

  test('registration stops before any database write when JWT configuration is missing', async () => {
    const originalFindOne = User.findOne;
    const originalCreate = User.create;
    let databaseTouched = false;
    User.findOne = async () => {
      databaseTouched = true;
      return null;
    };
    User.create = async () => {
      databaseTouched = true;
      return null;
    };

    try {
      await withEnvironment({ JWT_SECRET: undefined }, async () => {
        const { response, captured } = createResponse();
        await register(
          createRequest({ name: 'No Secret', email: 'no-secret@example.com', password: 'password123' }),
          response,
          assert.fail
        );

        assert.equal(captured.status, 500);
        assert.equal(captured.payload.success, false);
        assert.equal(captured.payload.message, 'Server configuration error. Please try again later.');
        assert.equal(databaseTouched, false);
      });
    } finally {
      User.findOne = originalFindOne;
      User.create = originalCreate;
    }
  });

  test('registration returns a verifiable token and a sanitized user with normalized email', async () => {
    const originalFindOne = User.findOne;
    const originalCreate = User.create;
    let createPayload;
    const createdUser = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Test User',
      email: 'test@example.com',
      password: '$2a$12$hashed-password-never-returned',
      role: 'user',
      isMasterAdmin: false,
      vehicleNumber: 'MH 01 AB 1234',
      phoneNumber: '',
    };
    User.findOne = async () => null;
    User.create = async (payload) => {
      createPayload = payload;
      return createdUser;
    };

    try {
      await withEnvironment({ JWT_SECRET: TEST_JWT_SECRET, JWT_EXPIRE: '7d' }, async () => {
        const { response, captured } = createResponse();
        await register(
          createRequest({
            name: 'Test User',
            email: '  TEST@Example.com ',
            password: 'password123',
            vehicleNumber: 'MH 01 AB 1234',
          }),
          response,
          assert.fail
        );

        assert.equal(captured.status, 201);
        assert.equal(captured.payload.success, true);
        assert.equal(createPayload.email, 'test@example.com');
        assert.equal(captured.payload.user.email, 'test@example.com');
        assert.equal(Object.hasOwn(captured.payload.user, 'password'), false);
        assert.equal(jwt.verify(captured.payload.token, TEST_JWT_SECRET).id, createdUser._id.toString());
      });
    } finally {
      User.findOne = originalFindOne;
      User.create = originalCreate;
    }
  });

  test('the User model hashes a password exactly once before saving', async () => {
    const user = new User({
      name: 'Hash Test',
      email: 'hash-test@example.com',
      password: 'password123',
    });

    await new Promise((resolve, reject) => {
      User.schema.s.hooks.execPre('save', user, [], (error) => (error ? reject(error) : resolve()));
    });

    const hashedPassword = user.password;
    assert.notEqual(hashedPassword, 'password123');
    assert.equal(await bcrypt.compare('password123', hashedPassword), true);

    // Mongoose clears modified paths after a real save. Mirror that state
    // before exercising the hook again to verify an unchanged hash is kept.
    user.$__reset();
    await new Promise((resolve, reject) => {
      User.schema.s.hooks.execPre('save', user, [], (error) => (error ? reject(error) : resolve()));
    });
    assert.equal(user.password, hashedPassword);
  });

  test('a duplicate-key race returns a safe validation response', async () => {
    const originalFindOne = User.findOne;
    const originalCreate = User.create;
    User.findOne = async () => null;
    User.create = async () => {
      const error = new Error('duplicate key');
      error.code = 11000;
      throw error;
    };

    try {
      await withEnvironment({ JWT_SECRET: TEST_JWT_SECRET }, async () => {
        const { response, captured } = createResponse();
        await register(
          createRequest({ name: 'Race User', email: 'race@example.com', password: 'password123' }),
          response,
          assert.fail
        );
        assert.equal(captured.status, 400);
        assert.deepEqual(captured.payload, { success: false, message: 'Email already registered' });
      });
    } finally {
      User.findOne = originalFindOne;
      User.create = originalCreate;
    }
  });

  test('registration validation rejects missing fields, invalid emails, and short passwords', async () => {
    const missingName = await runRegistrationValidation({ email: 'valid@example.com', password: 'password123' });
    const invalidEmail = await runRegistrationValidation({ name: 'Valid', email: 'invalid', password: 'password123' });
    const shortPassword = await runRegistrationValidation({ name: 'Valid', email: 'valid@example.com', password: 'short' });

    for (const result of [missingName, invalidEmail, shortPassword]) {
      assert.equal(result.continued, false);
      assert.equal(result.captured.status, 400);
      assert.equal(result.captured.payload.success, false);
      assert.ok(result.captured.payload.errors.length > 0);
    }
  });

  test('login succeeds for a registered user and signs with the same configuration', async () => {
    const originalFindOne = User.findOne;
    const user = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Login User',
      email: 'login@example.com',
      password: '$2a$12$not-exposed',
      role: 'user',
      isMasterAdmin: false,
      vehicleNumber: '',
      phoneNumber: '',
      comparePassword: async (password) => password === 'password123',
    };
    User.findOne = () => ({ select: async () => user });

    try {
      await withEnvironment({ JWT_SECRET: TEST_JWT_SECRET, JWT_EXPIRE: '7d' }, async () => {
        const { response, captured } = createResponse();
        await login(createRequest({ email: ' LOGIN@example.com ', password: 'password123' }), response, assert.fail);

        assert.equal(captured.status, undefined);
        assert.equal(captured.payload.success, true);
        assert.equal(captured.payload.user.email, 'login@example.com');
        assert.equal(Object.hasOwn(captured.payload.user, 'password'), false);
        assert.equal(jwt.verify(captured.payload.token, TEST_JWT_SECRET).id, user._id.toString());
      });
    } finally {
      User.findOne = originalFindOne;
    }
  });

  test('the authentication middleware accepts a token issued by login configuration', async () => {
    const originalFindById = User.findById;
    const tokenUser = { _id: new mongoose.Types.ObjectId(), email: 'protected@example.com' };
    User.findById = async (id) => (id === tokenUser._id.toString() ? tokenUser : null);

    try {
      await withEnvironment({ JWT_SECRET: TEST_JWT_SECRET }, async () => {
        const token = jwt.sign({ id: tokenUser._id.toString() }, TEST_JWT_SECRET, { expiresIn: '7d' });
        const request = { headers: { authorization: `Bearer ${token}` } };
        const { response, captured } = createResponse();
        let continued = false;

        await protect(request, response, () => {
          continued = true;
        });

        assert.equal(continued, true);
        assert.equal(captured.status, undefined);
        assert.equal(request.user, tokenUser);
      });
    } finally {
      User.findById = originalFindById;
    }
  });

  test(
    'database-backed registration and login flow',
    { skip: process.env.AUTH_TEST_MONGODB_URI ? false : 'Set AUTH_TEST_MONGODB_URI to an isolated MongoDB database to run this integration test.' },
    async () => {
      const email = `issue-1-${Date.now()}@smartpark.test`;
      const originalUri = process.env.MONGODB_URI;
      try {
        process.env.MONGODB_URI = process.env.AUTH_TEST_MONGODB_URI;
        await mongoose.connect(process.env.AUTH_TEST_MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
        await withEnvironment({ JWT_SECRET: TEST_JWT_SECRET, JWT_EXPIRE: '7d' }, async () => {
          const registration = createResponse();
          await register(
            createRequest({ name: 'Integration User', email, password: 'password123' }),
            registration.response,
            assert.fail
          );
          assert.equal(registration.captured.status, 201);
          assert.equal(jwt.verify(registration.captured.payload.token, TEST_JWT_SECRET).id, registration.captured.payload.user._id.toString());

          const storedUser = await User.findOne({ email }).select('+password');
          assert.equal(await bcrypt.compare('password123', storedUser.password), true);

          const loginResponse = createResponse();
          await login(createRequest({ email, password: 'password123' }), loginResponse.response, assert.fail);
          assert.equal(loginResponse.captured.payload.success, true);
        });
      } finally {
        await User.deleteOne({ email }).catch(() => {});
        await mongoose.disconnect().catch(() => {});
        if (originalUri === undefined) delete process.env.MONGODB_URI;
        else process.env.MONGODB_URI = originalUri;
      }
    }
  );
});
