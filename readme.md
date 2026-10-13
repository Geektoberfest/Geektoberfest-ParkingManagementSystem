# 🚗 SmartPark System

A full-stack Smart Parking Management System designed to help users find, view, and reserve parking spots seamlessly while providing administrators with real-time management capabilities.

---

## 🌟 Features

- **Authentication & Roles**: Secure login/signup system with role-based access (User and Admin).
- **Interactive Maps**: Real-time map views for locating nearby parking zones.
- **Parking Management**: Search, view availability, and reserve parking slots.
- **Admin Dashboard**: Comprehensive dashboard layout for managing parking locations, slots, and bookings[cite: 2].
- **Dark/Light Mode**: Built-in theme context support for user preference[cite: 2].
- **Online Payments (Razorpay, test mode)**: Server-computed parking fares with a breakdown review, Razorpay test checkout, signature verification, and idempotent webhooks.
- **Containerized Deployment**: Dockerized backend setup for consistent environments.

---

## 🛠️ Tech Stack

### **Backend**
- **Runtime**: Node.js & Express.js (also runnable with [Bun](https://bun.sh/))
- **Database**: MongoDB (via `db.js` configuration)
- **Payments**: Razorpay SDK (`razorpay` package, test mode)
- **Containerization**: Docker

### **Frontend**
- **Framework/Library**: React.js (`.jsx`)[cite: 2]
- **Styling**: CSS / Tailwind CSS[cite: 2]
- **State Management**: React Context API (`AuthContext`, `ThemeContext`)[cite: 2]

---

## 📁 Project Structure

```text
SmartParkSystem-FINAL/
│
├── backend/
│   ├── config/          # Database & app configuration
│   ├── controllers/     # API route handlers (incl. paymentController: quote/order/verify/webhook)
│   ├── middleware/      # Auth & validation middleware
│   ├── models/          # Mongoose schemas (incl. Payment with Razorpay refs + fare breakdown)
│   ├── routes/          # Express API endpoints
│   ├── services/        # Business logic services (pricingService, razorpayService, ...)
│   ├── uploads/         # Uploaded assets/images
│   ├── .env.example     # Environment variable template
│   ├── Dockerfile       # Backend container definition
│   ├── package.json     # Node.js dependencies
│   └── server.js        # Server entry point
│
└── frontend/
    └── src/
        ├── components/  # Reusable UI components (auth, map, parking incl. FareBreakdown, ui)
        ├── context/     # AuthContext & ThemeContext
        ├── layouts/     # AdminLayout & DashboardLayout
        ├── pages/       # Application views/routes
        ├── services/    # Frontend API call services (incl. razorpayClient)
        ├── utils/       # Utility/helper functions
        └── App.jsx      # Root component
```[cite: 1, 2]

---

## 🚀 Getting Started

### **Prerequisites**
- [Node.js](https://nodejs.org/) (v18+ recommended) **or** [Bun](https://bun.sh/) (v1+)
- [MongoDB](https://www.mongodb.com/) (Local or Atlas URL)
- [Docker](https://www.docker.com/) *(Optional, for containerized running)*
- Razorpay account in **Test Mode** (test keys only — no website verification needed for test mode)
- [zrok](https://zrok.io/) *(Optional, only for local webhook testing)*

---

### **1. Clone the Repository**

```bash
git clone https://github.com/your-username/SmartParkSystem.git
cd SmartParkSystem
```

### **2. Backend Setup**

```bash
cd backend

# Install dependencies (pick one)
npm install
# or
bun install

# Set up environment variables
cp .env.example .env
```

Fill in `backend/.env` (secrets only — never commit this file):

```bash
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/...
JWT_SECRET=<long random string, e.g. output of: bun -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
JWT_EXPIRE=7d
CLIENT_URL=http://localhost:5173

# Razorpay test mode (Dashboard → Test Mode → API Keys)
RAZORPAY_KEY_ID=<test key id>
RAZORPAY_KEY_SECRET=<test key secret, server-only>
RAZORPAY_WEBHOOK_SECRET=<secret you type when creating the webhook, see below>
CURRENCY=INR
```

Start the backend server:

```bash
# Development mode
npm run dev
# or with Bun (hot reload, no nodemon needed)
bun run dev:bun

# Production mode
npm start
# or
bun run start:bun
```

Expect: `MongoDB Connected`, `Admin user seeded: admin@smartpark.com / admin123`,
`SmartPark Server running on port 5000`. Health check: `http://localhost:5000/api/health`.

### **3. Frontend Setup**

Open a new terminal window and run:

```bash
cd frontend

# Install dependencies (pick one)
npm install
# or
bun install

# Start development server
npm run dev
# or
bun run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` → `http://localhost:5000`,
so no frontend `.env` is required. Login with the seeded admin
`admin@smartpark.com / admin123` or register a new user.

---

## 💳 Payments — How It Works (Razorpay Test Mode)

No real money moves. Test keys process simulated transactions only.

**Flow:**

1. **Fare quote (server-computed)** — `POST /api/payments/quote` with `{ bookingId }`
   (or `{ parkingLotId, startTime, endTime }` for a pre-booking preview).
   `services/pricingService.js` ceil-rounds duration to whole hours and applies
   configurable rules (`parkingTaxPercent`, `serviceFeeFlat`, `overdueMultiplier`
   — editable via `PUT /api/settings`). The client total is display-only and ignored.
2. **Order creation** — `POST /api/payments/create-order` with `{ bookingId }`.
   The server recomputes the total, syncs `booking.totalAmount`, creates a Razorpay
   order (amount in paise) plus a `pending` `Payment` holding `razorpayOrderId`,
   `receipt`, `currency`, and the fare `breakdown` snapshot. Reuses an existing
   pending order for the same booking + amount (idempotent).
3. **Checkout** — `frontend/src/services/razorpayClient.js` loads
   `checkout.js` on demand and opens Razorpay with the server-issued `order_id`
   and public `keyId` (the secret never leaves the server).
4. **Verification** — `POST /api/payments/verify` checks the HMAC-SHA256 signature
   (`order_id|payment_id` with `RAZORPAY_KEY_SECRET`) and confirms status with
   Razorpay (`payments.fetch`). On success the payment flips to `success` and the
   booking to `completed`, exactly once — repeats return `duplicate:true`.
5. **Webhook** — `POST /api/payments/webhook` (no auth; verified by
   `X-Razorpay-Signature` against `RAZORPAY_WEBHOOK_SECRET` over the raw body —
   hence `express.raw` in `server.js`). Handles `payment.captured` / `order.paid`
   (success) and `payment.failed`; duplicate deliveries are acked without side effects.
6. **Status polling** — `GET /api/payments/status/:bookingId` for pending states;
   history/receipts via `GET /api/payments/history` and `GET /api/payments/receipt/:id`.

**Test it:** Book Parking → pick slot + times → Confirm → My Bookings → Pay Now →
review the fare modal → Pay with test card `4111 1111 1111 1111` (any future expiry,
any CVV) or test UPI `success@razorpay`. Check Payment History and
Razorpay Dashboard (Test Mode) → Payments / Webhooks → Logs.

**Security rules:** `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` live only in
`backend/.env`. The frontend only ever receives the public key id from
`create-order`. Test API key CSVs must not be committed
(`razorpay*.csv` is git-ignored); delete them after copying values to `.env`.

---

## 🔗 Local Webhook Development with zrok

Razorpay cannot reach `localhost`, so webhooks need a public URL. zrok is
recommended because Razorpay blacklists many common tunnel domains.

```powershell
# 1. Register at https://zrok.io, copy your enable token, then (any directory, once per machine):
zrok enable <your-token>

# 2. Terminal 1 — backend running:
cd backend
bun run dev:bun

# 3. Terminal 2 — share it (leave running):
zrok share public http://localhost:5000
# prints e.g. https://xxxxx.zrok.io

# 4. Sanity check in a browser:
https://xxxxx.zrok.io/api/health   # expect {"success":true,...}
# ("Cannot GET /" on the bare domain is normal — the API only serves /api/*.)

# 5. Razorpay Dashboard (Test Mode) → Accounts & Settings → Webhooks → Add New Webhook:
#    URL:    https://xxxxx.zrok.io/api/payments/webhook
#    Events: payment.captured, payment.failed, order.paid
#    Secret: type any random string YOU invent (this is RAZORPAY_WEBHOOK_SECRET)

# 6. Store it and restart the backend:
#    backend/.env → RAZORPAY_WEBHOOK_SECRET="<the secret you typed>"
#    Ctrl+C terminal 1, then: bun run dev:bun
```

Make a test payment and watch Dashboard → Webhooks → Logs for delivery.
Re-deliver an event from the dashboard to confirm idempotency
(`duplicate:true`, single `success` record). Webhooks are optional —
checkout + verify complete payments without any tunnel.