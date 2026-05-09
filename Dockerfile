# Use Node.js LTS
FROM node:20-slim

# Install dependencies needed for some native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose the port LiveKit uses for the HTTP server
EXPOSE 8080

# Command to run the agent in worker mode
# Note: Railway provides a PORT env var, LiveKit agents listen on a port by default.
CMD ["npm", "run", "start", "--", "start"]
