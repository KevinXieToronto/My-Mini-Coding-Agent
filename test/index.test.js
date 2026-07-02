const { test } = require('node:test');
const assert = require('node:assert');
const { greet } = require('../index.js');

test('greet returns a greeting', () => {
  assert.strictEqual(greet('world'), 'Hello, world!');
});
