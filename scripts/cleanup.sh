#!/bin/bash

echo "Cleaning up PostgreSQL database..."
echo "=================================="

# Check if PostgreSQL is running
if systemctl is-active --quiet postgresql; then
    echo "PostgreSQL is running. Truncating tables..."
    
    # Connect to the database and truncate all tables
    echo "Truncating transfer_events table..."
    sudo -u postgres psql -d token_balances -c "TRUNCATE TABLE transfer_events RESTART IDENTITY CASCADE;"
    
    echo "Truncating block_events table..."
    sudo -u postgres psql -d token_balances -c "TRUNCATE TABLE block_events RESTART IDENTITY CASCADE;"
    
    echo "Resetting sequences..."
    sudo -u postgres psql -d token_balances -c "ALTER SEQUENCE transfer_events_id_seq RESTART WITH 1;"
    sudo -u postgres psql -d token_balances -c "ALTER SEQUENCE block_events_id_seq RESTART WITH 1;"
    
    echo ""
    echo "Database cleanup completed!"
    echo "All tables have been truncated and sequences reset."
else
    echo "PostgreSQL is not running. Starting it first..."
    sudo systemctl start postgresql
    
    # Wait a moment for PostgreSQL to start
    sleep 2
    
    echo "Truncating transfer_events table..."
    sudo -u postgres psql -d token_balances -c "TRUNCATE TABLE transfer_events RESTART IDENTITY CASCADE;"
    
    echo "Truncating block_events table..."
    sudo -u postgres psql -d token_balances -c "TRUNCATE TABLE block_events RESTART IDENTITY CASCADE;"
    
    echo "Resetting sequences..."
    sudo -u postgres psql -d token_balances -c "ALTER SEQUENCE transfer_events_id_seq RESTART WITH 1;"
    sudo -u postgres psql -d token_balances -c "ALTER SEQUENCE block_events_id_seq RESTART WITH 1;"
    
    echo ""
    echo "Database cleanup completed!"
    echo "All tables have been truncated and sequences reset."
fi

echo ""
echo "You can now run ingest again with a clean database." 