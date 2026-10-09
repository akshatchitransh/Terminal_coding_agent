
FROM node:22-bookworm-slim

WORKDIR /sandbox

COPY server.js ./server.js

ENV NODE_ENV=production
ENV PORT=8787

USER node

EXPOSE 8787

CMD ["node", "server.js"]
