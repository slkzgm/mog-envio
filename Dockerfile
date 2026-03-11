FROM node:20-slim

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install

COPY . .

RUN pnpm run codegen

COPY start.sh .
RUN chmod +x ./start.sh

RUN ln -s . root

EXPOSE 8081

CMD ["./start.sh"]
