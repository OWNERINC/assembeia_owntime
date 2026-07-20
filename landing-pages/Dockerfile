FROM node:24-alpine

WORKDIR /app

COPY landing-pages ./landing-pages
COPY assets ./assets

ENV LANDING_PAGES_PORT=4180

EXPOSE 4180

CMD ["node", "landing-pages/server.mjs"]
