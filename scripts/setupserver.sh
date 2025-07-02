#!/bin/bash

echo "Setting up PostgreSQL for ORIBGT Balances API on AWS"
echo "==================================================="

# Enable PostgreSQL 15 repository
echo "Enabling PostgreSQL 15 repository..."
sudo amazon-linux-extras enable postgresql15
sudo dnf clean metadata

# Install PostgreSQL 15
echo "Installing PostgreSQL 15..."
sudo dnf install -y postgresql15 postgresql15-server

# Initialize PostgreSQL database
echo "Initializing PostgreSQL database..."
sudo /usr/pgsql-15/bin/postgresql-15-setup initdb

# Start and enable PostgreSQL
echo "Starting PostgreSQL service..."
sudo systemctl enable postgresql-15
sudo systemctl start postgresql-15

# Create database and user
echo "Setting up database and user..."
sudo su - postgres << EOF
psql << SQL
CREATE USER token_user WITH PASSWORD 'token_user_password_420';
CREATE DATABASE token_balances OWNER token_user;
\q
SQL
exit
EOF

echo ""
echo "PostgreSQL setup completed!"
echo ""
echo "Database tables (transfer_events and block_events) will be created automatically"
echo "when you first run the application (ingest.ts, update.ts, or app.ts)."
echo ""
echo "Add these to your .env file:"
echo "DB_HOST=localhost"
echo "DB_PORT=5432"
echo "DB_NAME=token_balances"
echo "DB_USER=token_user"
echo "DB_PASSWORD=token_user_password_420"
echo ""
echo "Remember to change 'token_user_password_420' to a secure password!" 