#!/bin/bash

echo "Cleaning up PostgreSQL databases and stopping service..."
echo "======================================================"

# Stop PostgreSQL service
echo "Stopping PostgreSQL service..."
sudo systemctl stop postgresql

# Connect as postgres user and drop the database
echo "Dropping token_balances database..."
sudo -u postgres psql -c "DROP DATABASE IF EXISTS token_balances;"

# Drop the user if it exists
echo "Dropping token_user..."
sudo -u postgres psql -c "DROP USER IF EXISTS token_user;"

echo ""
echo "Cleanup completed!"
echo "PostgreSQL service stopped and databases cleaned."
echo ""
echo "To restart PostgreSQL: sudo systemctl start postgresql"
echo "To run setup again: ./setup-db.sh" 