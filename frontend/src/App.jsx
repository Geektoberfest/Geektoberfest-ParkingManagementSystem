import { Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import LoadingSpinner from './components/ui/LoadingSpinner';
import ProtectedRoute from './components/auth/ProtectedRoute';
import DashboardLayout from './layouts/DashboardLayout';
import AdminLayout from './layouts/AdminLayout';

// Public pages
const Home = lazy(() => import('./pages/public/Home'));
const About = lazy(() => import('./pages/public/About'));
const Features = lazy(() => import('./pages/public/Features'));
const Contact = lazy(() => import('./pages/public/Contact'));
const ParkingLots = lazy(() => import('./pages/public/ParkingLots'));
const NearbyParking = lazy(() => import('./pages/public/NearbyParking'));
const ParkingDetail = lazy(() => import('./pages/public/ParkingDetail'));
const FAQ = lazy(() => import('./pages/public/FAQ'));
const NotFound = lazy(() => import('./pages/public/NotFound'));

// Auth pages
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));

// User pages
const UserDashboard = lazy(() => import('./pages/user/UserDashboard'));
const BookParking = lazy(() => import('./pages/user/BookParking'));
const MyBookings = lazy(() => import('./pages/user/MyBookings'));
const PaymentHistory = lazy(() => import('./pages/user/PaymentHistory'));
const Profile = lazy(() => import('./pages/user/Profile'));
const UserMessages = lazy(() => import('./pages/user/UserMessages'));
const VehicleManagement = lazy(() => import('./pages/user/VehicleManagement'));
const Notifications = lazy(() => import('./pages/user/Notifications'));

// Admin pages
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview'));
const ManageParkingLots = lazy(() => import('./pages/admin/ManageParkingLots'));
const ManageSlots = lazy(() => import('./pages/admin/ManageSlots'));
const ManageUsers = lazy(() => import('./pages/admin/ManageUsers'));
const AdminBookings = lazy(() => import('./pages/admin/AdminBookings'));
const AdminPayments = lazy(() => import('./pages/admin/AdminPayments'));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'));
const AdminMessages = lazy(() => import('./pages/admin/AdminMessages'));
const ActiveMonitoring = lazy(() => import('./pages/admin/ActiveMonitoring'));


const App = () => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg transition-colors duration-300">
      <Navbar />
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<><Home /><Footer /></>} />
          <Route path="/about" element={<><About /><Footer /></>} />
          <Route path="/features" element={<><Features /><Footer /></>} />
          <Route path="/contact" element={<><Contact /><Footer /></>} />
          <Route path="/parking" element={<><ParkingLots /><Footer /></>} />
          <Route path="/nearby" element={<NearbyParking />} />
          <Route path="/parking/:id" element={<><ParkingDetail /><Footer /></>} />
          <Route path="/faq" element={<><FAQ /><Footer /></>} />

          {/* Auth Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />

          {/* User Dashboard Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<UserDashboard />} />
            <Route path="book" element={<BookParking />} />
            <Route path="book/:lotId" element={<BookParking />} />
            <Route path="bookings" element={<MyBookings />} />
            <Route path="payments" element={<PaymentHistory />} />
            <Route path="messages" element={<UserMessages />} />
            <Route path="vehicles" element={<VehicleManagement />} />
            <Route path="profile" element={<Profile />} />
            <Route path="notifications" element={<Notifications />} />
          </Route>

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminOverview />} />
            <Route path="parking-lots" element={<ManageParkingLots />} />
            <Route path="slots" element={<ManageSlots />} />
            <Route path="users" element={<ManageUsers />} />
            <Route path="bookings" element={<AdminBookings />} />
            <Route path="payments" element={<AdminPayments />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="messages" element={<AdminMessages />} />
            <Route path="monitoring" element={<ActiveMonitoring />} />

          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </div>
  );
};

export default App;
