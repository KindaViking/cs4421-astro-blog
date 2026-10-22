/* global __ENV */
import http from 'k6/http';
import { check, sleep } from 'k6';

// Where to send traffic, and which profile to use. Both are set with -e.
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4321';
const PROFILE = __ENV.PROFILE || 'ci';

const profiles = {
  // Short, steady load in CI to catch performance regressions.
  ci: {
    vus: 10,
    duration: '30s',
  },
  // Ramps up against the live site to find where one task starts to struggle.
  stress: {
    stages: [
      { duration: '1m', target: 10 },
      { duration: '2m', target: 25 },
      { duration: '2m', target: 50 },
      { duration: '1m', target: 0 },
    ],
  },
};

export const options = {
  ...profiles[PROFILE],
  thresholds: {
    // Fewer than 1% of requests may fail.
    http_req_failed: ['rate<0.01'],
    // 95% of requests must finish in under 500 ms.
    http_req_duration: ['p(95)<500'],
  },
};

// Each virtual user repeats this: load two pages, then pause for a second.
// The home page is left out because it calls NASA's rate-limited API.
export default function () {
  const health = http.get(`${BASE_URL}/api/health`);
  check(health, { 'health returns 200': (r) => r.status === 200 });

  const blog = http.get(`${BASE_URL}/blog`);
  check(blog, { 'blog returns 200': (r) => r.status === 200 });

  sleep(1);
}
