import { createLandingPagesServer } from '../../landing-pages/server.mjs';

const server = createLandingPagesServer();

export default function handler(request, response) {
  server.emit('request', request, response);
}
