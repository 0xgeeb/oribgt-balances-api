#!/bin/bash

echo "🧹 Starting server cleanup..."

# Stop PM2 processes
echo "📦 Stopping PM2 processes..."
pm2 stop all 2>/dev/null || echo "No PM2 processes running"
pm2 delete all 2>/dev/null || echo "No PM2 processes to delete"

# Clean up PM2 logs
echo "📋 Cleaning PM2 logs..."
pm2 flush 2>/dev/null || echo "No PM2 logs to clean"

# Clean up any temporary files
echo "🗑️  Cleaning temporary files..."
rm -f *.log 2>/dev/null || echo "No log files found"
rm -f .env 2>/dev/null || echo "No .env file found"

echo ""
echo "🗄️  Cleaning up PostgreSQL database..."
echo "======================================"

# Check if PostgreSQL is running
if systemctl is-active --quiet postgresql; then
    echo "PostgreSQL is running. Truncating tables..."
    
    # Connect to the database and truncate all tables
    echo "Truncating transfer_events table..."
    sudo -u postgres psql -d token_balances -c "TRUNCATE TABLE transfer_events RESTART IDENTITY CASCADE;"
    
    echo "Truncating latest_blocks table..."
    sudo -u postgres psql -d token_balances -c "TRUNCATE TABLE latest_blocks RESTART IDENTITY CASCADE;"
    
    echo "Resetting sequences..."
    sudo -u postgres psql -d token_balances -c "ALTER SEQUENCE transfer_events_id_seq RESTART WITH 1;"
    sudo -u postgres psql -d token_balances -c "ALTER SEQUENCE latest_blocks_id_seq RESTART WITH 1;"
    
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
    
    echo "Truncating latest_blocks table..."
    sudo -u postgres psql -d token_balances -c "TRUNCATE TABLE latest_blocks RESTART IDENTITY CASCADE;"
    
    echo "Resetting sequences..."
    sudo -u postgres psql -d token_balances -c "ALTER SEQUENCE transfer_events_id_seq RESTART WITH 1;"
    sudo -u postgres psql -d token_balances -c "ALTER SEQUENCE latest_blocks_id_seq RESTART WITH 1;"
    
    echo ""
    echo "Database cleanup completed!"
    echo "All tables have been truncated and sequences reset."
fi

echo ""
echo "✅ Server cleanup completed!"
echo ""
echo "To restart services:"
echo "  sudo systemctl start postgresql"
echo "  pm2 start update.ts --name updater"
echo "  pm2 start app.ts --name api"
echo ""
echo "You can now run ingest again with a clean database." 