FROM node:20.18.0 AS development

WORKDIR /usr/src/app

COPY package.json ./
COPY package-lock.json ./
COPY tsconfig.json tsconfig.json
COPY nest-cli.json nest-cli.json
COPY copy-worker.js ./
COPY copy-worker-dev.js ./

RUN npm install

COPY src src 

RUN npm run build

FROM node:20.18.0 AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

COPY package.json ./
COPY package-lock.json ./

RUN npm install --only=production

COPY --from=development /usr/src/app/dist ./dist
COPY copy-worker.js ./

CMD ["node", "dist/main"]