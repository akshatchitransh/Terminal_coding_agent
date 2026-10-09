const assert = require('assert');
const { divide } = require('./buggy');

// Test normal division
assert.strictEqual(divide(10, 2), 5, '10 / 2 should equal 5');
assert.strictEqual(divide(9, 3), 3, '9 / 3 should equal 3');

// Test division by zero throws error
assert.throws(
  () => divide(10, 0),
  (err) => err instanceof Error && err.message === 'Division by zero',
  'Division by zero should throw an Error with message "Division by zero"'
);

console.log('All tests passed');
