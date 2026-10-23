FROM node:22.23.4-alpine

WORKDIR /app

# Copy KVN library (local dependency)
COPY kvn-package/ ./kvn-package/

# Copy package files (references kvn-package via file:)
COPY package*.json ./

# Install all dependencies (tsx is needed at runtime)
RUN npm ci

# Copy application files
COPY . .

# Build the Vite frontend
RUN npm run build

EXPOSE 8080

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

# Run the Express server (which serves both API and static files)
CMD ["npm", "run", "start:prod"]
