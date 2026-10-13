class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigurationError';
    this.code = 'CONFIGURATION_ERROR';
  }
}

const getRequiredEnvironmentVariable = (name) => {
  const value = process.env[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new ConfigurationError(`${name} must be configured before starting the server`);
  }

  return value.trim();
};

const getJwtSecret = () => getRequiredEnvironmentVariable('JWT_SECRET');

const getJwtExpiration = () => {
  const value = process.env.JWT_EXPIRE;
  return typeof value === 'string' && value.trim() ? value.trim() : '7d';
};

const validateRuntimeConfiguration = () => {
  getRequiredEnvironmentVariable('MONGODB_URI');
  getJwtSecret();
};

module.exports = {
  ConfigurationError,
  getJwtSecret,
  getJwtExpiration,
  validateRuntimeConfiguration,
};
