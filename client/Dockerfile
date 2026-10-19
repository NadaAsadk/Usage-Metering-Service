FROM node:22-alpine
WORKDIR /client
COPY server.mjs index.html ./
ENV NODE_ENV=production PORT=8080 API_BASE_URL=http://api:3000
EXPOSE 8080
CMD ["node", "server.mjs"]
