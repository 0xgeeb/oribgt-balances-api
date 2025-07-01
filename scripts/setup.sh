#!/bin/bash

echo "Setting up PostgreSQL for ORIBGT Balances API"
echo "============================================="

# Update system
echo "Updating system packages..."
sudo apt update

# Install PostgreSQL
echo "Installing PostgreSQL..."
sudo apt install -y postgresql postgresql-contrib

# Start and enable PostgreSQL
echo "Starting PostgreSQL service..."
sudo systemctl start postgresql

# Create database and user
echo "Setting up database and user..."
sudo -u postgres psql << EOF
CREATE DATABASE token_balances;
CREATE USER token_user WITH PASSWORD 'token_user_password_420';
GRANT ALL PRIVILEGES ON DATABASE token_balances TO token_user;
\q
EOF

echo ""
echo "PostgreSQL setup completed!"
echo ""
echo "Add these to your .env file:"
echo "DB_HOST=localhost"
echo "DB_PORT=5432"
echo "DB_NAME=token_balances"
echo "DB_USER=token_user"
echo "DB_PASSWORD=token_user_password_420"
echo ""
echo "Remember to change 'token_user_password_420' to a secure password!" 