#!/bin/bash

echo "Setting up PostgreSQL on AWS EC2 server..."

# Update system packages
echo "Updating system packages..."
sudo dnf update -y

# Install PostgreSQL repository and PostgreSQL
echo "Installing PostgreSQL..."
sudo dnf install -y postgresql15 postgresql15-server postgresql15-contrib

# Initialize PostgreSQL database
echo "Initializing PostgreSQL database..."
sudo postgresql-15-setup initdb

# Start and enable PostgreSQL service
echo "Starting PostgreSQL service..."
sudo systemctl start postgresql-15
sudo systemctl enable postgresql-15

# Check if PostgreSQL is running
if sudo systemctl is-active --quiet postgresql-15; then
    echo "PostgreSQL is running successfully!"
else
    echo "Failed to start PostgreSQL. Checking status..."
    sudo systemctl status postgresql-15
    exit 1
fi

# Switch to postgres user to set up database and user
echo "Setting up database and user..."
sudo -u postgres psql -c "CREATE DATABASE token_balances;"
sudo -u postgres psql -c "CREATE USER token_user WITH PASSWORD 'token_user_password_420';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE token_balances TO token_user;"
sudo -u postgres psql -c "ALTER USER token_user CREATEDB;"

# Configure PostgreSQL to allow connections from localhost
echo "Configuring PostgreSQL for local connections..."
sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = 'localhost'/" /var/lib/pgsql/15/data/postgresql.conf
sudo sed -i "s/#port = 5432/port = 5432/" /var/lib/pgsql/15/data/postgresql.conf

# Update pg_hba.conf to allow local connections with password
echo "Updating authentication configuration..."
sudo sed -i 's/local   all             all                                     peer/local   all             all                                     md5/' /var/lib/pgsql/15/data/pg_hba.conf
sudo sed -i 's/host    all             all             127.0.0.1\/32            ident/host    all             all             127.0.0.1\/32            md5/' /var/lib/pgsql/15/data/pg_hba.conf
sudo sed -i 's/host    all             all             ::1\/128                 ident/host    all             all             ::1\/128                 md5/' /var/lib/pgsql/15/data/pg_hba.conf

# Restart PostgreSQL to apply changes
echo "Restarting PostgreSQL to apply configuration changes..."
sudo systemctl restart postgresql-15

# Verify PostgreSQL is running
if sudo systemctl is-active --quiet postgresql-15; then
    echo "PostgreSQL setup completed successfully!"
else
    echo "PostgreSQL failed to restart. Checking status..."
    sudo systemctl status postgresql-15
    exit 1
fi

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
echo ""
echo "To test the connection, run:"
echo "psql -h localhost -U token_user -d token_balances"
echo "" 