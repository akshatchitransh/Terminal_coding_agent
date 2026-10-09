function divide(a, b) {
  // Incorrect implementation: does not handle division by zero properly
  if (b === 0) {
    throw new Error("Division by zero");
  }
  return a / b;
}

module.exports = { divide };
