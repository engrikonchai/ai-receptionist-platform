import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// RTL's automatic per-test cleanup only self-registers when
// `test.globals: true` is set; this project deliberately imports
// `describe`/`it`/... explicitly instead; wire cleanup up here.
afterEach(() => {
  cleanup();
});
