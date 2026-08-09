# Dine-In Food Ordering System

A full-stack web application for managing dine-in restaurant operations from table selection and food ordering through preparation, checkout, and payment.

The system provides separate interfaces for customers and restaurant administrators. Customers can browse the menu, place orders, and follow their order status, while administrators can manage menu items, process orders, handle bills, and review activity logs.

## Features

### Customer Interface

- Select a restaurant table before starting an order
- Browse menu items by category
- Add items to a shopping cart and adjust quantities
- Submit one or more orders for the selected table
- Review active and previous orders in an order summary
- Track order and item status without manually refreshing the page
- Cancel eligible order items while they are still pending
- Proceed to checkout and review bill information
- View the checkout result after payment is recorded

### Admin Dashboard

- Sign in through a protected administrator login
- Create, update, activate, and deactivate menu items
- Monitor incoming and active restaurant orders
- Update order items through the preparation workflow
- Cancel individual items or an entire eligible order
- View open and historical bills
- Mark bills as paid and record payment information
- Review administrator actions through an activity log
- Receive live updates when restaurant activity changes

## Order Workflow

Orders and order items use the following main statuses:

```text
pending -> preparing -> served -> completed
    \--------------------------------> cancelled
```

Cancellation is permitted only where the application rules allow it. When an order item is cancelled, the database recalculates the order total using the remaining active items.

## Real-Time Updates

The application uses **Server-Sent Events (SSE)** for one-way real-time communication from the backend to the frontend.

Live updates are used for:

- Customer order-status tracking
- Order-item changes
- Table-level order activity
- Admin order monitoring
- Menu changes
- Admin activity updates

This allows changes made through the Admin Dashboard to appear on relevant customer and administrator pages without a manual refresh.

## Technology Stack

### Frontend

- React
- React Router
- Vite
- Tailwind CSS
- PostCSS

### Backend

- Node.js
- Express.js
- REST APIs
- Server-Sent Events (SSE)
- JSON Web Tokens (JWT)
- bcrypt

### Database

- MySQL 8
- `mysql2` connection pool
- Relational tables and foreign-key relationships
- SQL JOIN operations
- Indexes and status fields
- Stored procedure
- Database triggers

## System Architecture

```text
Customer Interface ─┐
                    ├── React / Vite Frontend
Admin Dashboard ────┘            │
                                 │ REST API + SSE
                                 ▼
                         Node.js / Express.js
                                 │
                                 ▼
                              MySQL
```

The customer pages and Admin Dashboard share the same backend API and database while using separate routes and authorization rules.

## Database Design

The main database entities are:

- `user`
- `category`
- `food`
- `table_info`
- `orders`
- `order_item`
- `order_status_log`
- `bill`
- `bill_order`
- `payment`
- `admin_activity`

The database dump is provided in [`restaurant_db.sql`](./restaurant_db.sql). It creates the `restaurant_db` database and includes the schema together with sample data for local demonstration.

### Stored Procedure

`sp_get_bill_summary`

Returns a bill summary containing:

- Bill and table information
- Orders associated with the bill
- Ordered food items
- The calculated total amount

### Database Triggers

- `trg_orders_after_insert` sets a table to `occupied` when a new order is created.
- `trg_order_item_after_update` recalculates the order total when an item is cancelled.
- `trg_order_log_update` synchronizes the order update timestamp when a new status-log entry is recorded.

## Security

The project includes the following security practices:

- Administrator passwords are stored as bcrypt hashes
- Successful administrator login returns a JWT with a 12-hour expiration
- Administrative routes use authentication middleware
- SQL queries use parameter placeholders to reduce SQL injection risk
- Customer and administrator operations are separated into different API routes
- Secrets and environment-specific settings are loaded from `.env` files, which are excluded from Git

## Project Structure

```text
dinein-food-ordering-system/
├── backend/
│   ├── config/          # Database configuration
│   ├── middleware/      # Authentication middleware
│   ├── routes/          # Customer and admin API routes
│   ├── utils/           # Shared backend utilities
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── lib/
│   │   └── pages/
│   ├── package.json
│   └── vite.config.js
├── restaurant_db.sql
└── README.md
```

## Getting Started

### Prerequisites

Install the following software before running the project:

- Node.js and npm
- MySQL 8 or a compatible local MySQL environment
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/digi1450/dinein-food-ordering-system.git
cd dinein-food-ordering-system
```

### 2. Import the Database

Import `restaurant_db.sql` through MySQL Workbench, phpMyAdmin, or the command line:

```bash
mysql -u YOUR_MYSQL_USER -p < restaurant_db.sql
```

The script creates and selects a database named `restaurant_db`.

> The SQL dump contains sample menu, table, and administrator records for local demonstration. Administrator passwords are stored only as bcrypt hashes; no plain-text password is documented in this repository.

### 3. Configure the Backend

Create `backend/.env`:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=YOUR_MYSQL_USER
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=restaurant_db
JWT_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
PORT=5050
```

Use the actual port assigned to your MySQL server if it is not `3306`.

Install the dependencies and start the backend:

```bash
cd backend
npm install
npm run dev
```

The API runs at `http://127.0.0.1:5050` by default.

### 4. Configure the Frontend

The frontend uses `http://127.0.0.1:5050/api` as its default API base URL, so no frontend environment file is required for the standard local setup.

To use a different backend URL, create `frontend/.env` and set either of the supported variables:

```env
VITE_API_BASE=http://127.0.0.1:5050/api
```

`VITE_API` is also supported as an alternative variable name.

Install the dependencies and start the frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the URL displayed by Vite, normally `http://localhost:5173`.

## Application Routes

### Customer Routes

| Route | Purpose |
| --- | --- |
| `/` | Table selection |
| `/home` | Customer home page |
| `/menu` | Menu browsing |
| `/cart` | Shopping cart |
| `/summary` | Table order summary |
| `/summary/:orderId` | Individual order summary |
| `/checkout` | Checkout |
| `/checkout/success` | Checkout result |

### Admin Routes

| Route | Purpose |
| --- | --- |
| `/admin/login` | Administrator login |
| `/admin/dashboard` | Restaurant administration dashboard |

## API Overview

The Express backend exposes the following main route groups:

| Base Path | Responsibility |
| --- | --- |
| `/api/auth` | Authentication |
| `/api/menu` | Customer menu access |
| `/api/orders` | Customer order operations and updates |
| `/api/tables` | Restaurant table information |
| `/api/billing` | Customer billing and checkout |
| `/api/payments` | Payment records |
| `/api/admin/menu` | Admin menu management |
| `/api/admin/orders` | Admin order management |
| `/api/admin/billing` | Admin bill and payment management |
| `/api/admin/activity` | Admin activity history and updates |

## Available Scripts

### Frontend

```bash
npm run dev      # Start the Vite development server
npm run build    # Create a production build
npm run lint     # Run ESLint
npm run preview  # Preview the production build locally
```

### Backend

```bash
npm run dev      # Start the Express server with Nodemon
```

## Current Scope and Limitations

- The project is configured primarily for local development and demonstration.
- Backend CORS currently allows the local Vite origins `localhost:5173` and `127.0.0.1:5173`.
- Payment records support cash, QR, and card methods, but the project does not integrate an external payment gateway.
- The included SQL file contains demonstration data that may be replaced before production use.
- Automated tests are not currently included.

## Project Goal

The goal of this project is to demonstrate the design and implementation of a complete dine-in restaurant workflow using a modern full-stack architecture.

The project combines:

- Responsive customer and administrator interfaces
- Backend REST API development
- Authentication and authorization
- Relational database design
- CRUD operations
- SQL JOIN operations
- Transactions for order and billing workflows
- Real-time updates with Server-Sent Events
- Stored procedures and database triggers
- Billing, payment, status, and activity logging

The result is a web-based system that connects the customer ordering experience with restaurant-side order processing from table selection through checkout and payment.

