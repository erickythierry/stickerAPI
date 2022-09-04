FROM node
RUN apt-get update
RUN apt-get install ffmpeg -y
WORKDIR /app
COPY . /app
RUN npm i
CMD node index.js
