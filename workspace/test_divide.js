const assert = require('assert');
const { divide } = require('./divide');

// Test 1: divide(10, 2) === 5
assert.strictEqual(divide(10, 2), 5, 'divide(10,2) should be 5');

// Test 2: divide(9, 3) === 3
assert.strictEqual(divide(9, 3), 3, 'divide(9,3) should be 3');

// Test 3: divide(10, 0) throws error with message "Division by zero"
assert.throws(() => divide(10, 0), (err) => {
  return err instanceof Error && err.message === 'Division by zero';
}, 'divide(10,0) should throw Division by zero error');

console.log('All tests passed');
