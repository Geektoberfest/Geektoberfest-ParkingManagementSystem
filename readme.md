# 🚗 SmartPark System

A full-stack Smart Parking Management System designed to help users find, view, and reserve parking spots seamlessly while providing administrators with real-time management capabilities.

---

## 🌟 Features

- **Authentication & Roles**: Secure login/signup system with role-based access (User and Admin).
- **Interactive Maps**: Real-time map views for locating nearby parking zones.
- **Parking Management**: Search, view availability, and reserve parking slots.
- **Admin Dashboard**: Comprehensive dashboard layout for managing parking locations, slots, and bookings[cite: 2].
- **Dark/Light Mode**: Built-in theme context support for user preference[cite: 2].
- **Containerized Deployment**: Dockerized backend setup for consistent environments.

---

## 🛠️ Tech Stack

### **Backend**
- **Runtime**: Node.js & Express.js
- **Database**: MongoDB (via `db.js` configuration)
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
│   ├── controllers/     # API route handlers
│   ├── middleware/      # Auth & validation middleware
│   ├── models/          # Mongoose schemas
│   ├── routes/          # Express API endpoints
│   ├── services/        # Business logic services
│   ├── uploads/         # Uploaded assets/images
│   ├── .env.example     # Environment variable template
│   ├── Dockerfile       # Backend container definition
│   ├── package.json     # Node.js dependencies
│   └── server.js        # Server entry point
│
└── frontend/
    └── src/
        ├── components/  # Reusable UI components (auth, map, parking, ui)
        ├── context/     # AuthContext & ThemeContext
        ├── layouts/     # AdminLayout & DashboardLayout
        ├── pages/       # Application views/routes
        ├── services/    # Frontend API call services
        ├── utils/       # Utility/helper functions
        └── App.jsx      # Root component
```[cite: 1, 2]

---

## 🚀 Getting Started

### **Prerequisites**
- [Node.js](https://nodejs.org/) (v16+ recommended)
- [MongoDB](https://www.mongodb.com/) (Local or Atlas URL)
- [Docker](https://www.docker.com/) *(Optional, for containerized running)*

---

### **1. Clone the Repository**

```bash
git clone [https://github.com/your-username/SmartParkSystem.git](https://github.com/your-username/SmartParkSystem.git)
cd SmartParkSystem

Backend Setup
Bash
cd backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

Start the backend server:
Bash
# Development mode
npm run dev
# Production mode
npm start

Frontend Setup
Open a new terminal window and run:

Bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev # or npm start