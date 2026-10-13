const assert = require('node:assert/strict');
const { assertUploadsSucceeded, validateDeploymentConfig } = require('../scripts/deploy_cdn');
const test = require('node:test');

test('deployment requires an explicitly configured storage password', () => {
  assert.throws(() => validateDeploymentConfig(''), /BUNNY_STORAGE_PASSWORD is required/);
  assert.equal(validateDeploymentConfig('configured-by-test'), 'configured-by-test');
});

test('deployment reports failure when a required upload fails', () => {
  assert.throws(() => assertUploadsSucceeded(['app.js']), /1 required upload/);
  assert.doesNotThrow(() => assertUploadsSucceeded([]));
});
