# Use official Node.js 20 image
FROM node:20

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first (better caching)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy all source code
COPY . .

# Make sure Firebase service account exists
# (your .env points to /usr/src/app/firebase/serviceAccountKey.json)
COPY firebase ./firebase

# Expose port from .env (default 5000)
EXPOSE 5000

# Run the server
CMD ["node", "server.js"]
