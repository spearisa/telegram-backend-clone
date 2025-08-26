#!/bin/bash

# Set the Node.js path
export PATH="$HOME/.nvm/versions/node/v24.6.0/bin:$PATH"

# Set the port
export PORT=8080

# Start the server
echo "Starting server on port 8080..."
node src/index.js
