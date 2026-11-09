---
paths:
  - "tests/**"
  - "functions/test/**"
  - "firestore.rules"
---

# Testing

## Project specifics
- Framework: Node's built-in `node:test`; rules tests with `@firebase/rules-unit-testing` against the Firestore emulator (project `demo-familyhub`); function tests with stub APIs from `functions/test/helpers.js`, never real calls
- Run all: `npm test` · run one file: `node --test tests/<file>.test.js`
- Approach: tests with every change: new rules get allow and deny cases, new logic gets unit tests
- Coverage expectation: no number; every rule path that grants access is tested

## Always
- Every bug fix gets a test that fails before the fix and passes after.
- Test behaviour through public interfaces, not implementation details.
- One reason to fail per test; name tests after the behaviour they check.
- No real network, clock or randomness in unit tests. Fake them.
- Never delete or weaken a failing test to make the suite pass. Fix the code or ask.
