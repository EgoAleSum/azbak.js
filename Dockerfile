# Using Node.js 10 LTS
FROM node:10-alpine

# Set workdir
WORKDIR /usr/src/app

# Copy the app
COPY . .

# Install the app globally
RUN npm install --production --global

# Set the default command
CMD azbak
