import { setupServer } from 'msw/node';

// A fake internet for the integration tests. Each test adds the API
// responses it needs with server.use(). Any request without a handler
// fails the test, so nothing ever reaches the real APIs.
export const server = setupServer();
